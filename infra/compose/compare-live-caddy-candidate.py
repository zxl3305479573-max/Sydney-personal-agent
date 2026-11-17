#!/usr/bin/env python3
"""Compare a candidate with the production Caddy configuration without loading it."""

import base64
import ipaddress
import json
from pathlib import Path
import shlex
import subprocess
import sys

REMOTE = r"""
import base64,ipaddress,json,subprocess,sys

payload=json.load(sys.stdin)
ip=str(ipaddress.IPv4Address(payload["ip"]))
candidate=base64.b64decode(payload["candidate"],validate=True)
if len(candidate)>1048576:
    raise ValueError("candidate too large")
docker="/usr/bin/docker"
container="rakazo-prod-caddy-1"
def call(args, data=None):
    return subprocess.run([docker,*args],input=data,stdout=subprocess.PIPE,
                          stderr=subprocess.DEVNULL,check=True,timeout=20).stdout
info=json.loads(call(["inspect",container]))[0]
if not info["State"]["Running"]:
    raise ValueError("Caddy not running")
env={}
for entry in info["Config"]["Env"]:
    key,sep,value=entry.partition("=")
    if sep and key=="RAKAZO_HOST":
        if key in env: raise ValueError("duplicate host")
        env[key]=value
if not env.get("RAKAZO_HOST"):
    raise ValueError("domain unavailable")
live=json.loads(call(["exec",container,"curl","-fsS","--max-time","5",
                      "http://127.0.0.1:2019/config/"]))
certs=live.get("apps",{}).get("tls",{}).get("certificates",{}).get("load_files",[])
if len(certs)!=1 or set(certs[0])!={"certificate","key","tags"}:
    raise ValueError("unexpected certificate layout")
env.update({"RAKAZO_CERT_FILE":certs[0]["certificate"],
            "RAKAZO_KEY_FILE":certs[0]["key"],
            "RAKAZO_PUBLIC_IP":ip,
            "RAKAZO_IP_ACME_DIRECTORY":"https://acme-staging-v02.api.letsencrypt.org/directory"})
args=["exec","-i"]
for key,value in env.items():
    args.extend(["-e",key+"="+value])
args.extend([container,"caddy","adapt","--config","/dev/stdin","--adapter","caddyfile"])
proposed=json.loads(call(args,candidate))
def servers(config):
    return list(config.get("apps",{}).get("http",{}).get("servers",{}).values())
def domain_routes(config):
    found=[]
    for server in servers(config):
        for route in server.get("routes",[]):
            if any(env["RAKAZO_HOST"] in item.get("host",[]) for item in route.get("match",[])):
                found.append((server,route))
    if len(found)!=1:
        raise ValueError("unexpected domain route count")
    return found[0]
def nested_lists(node):
    if isinstance(node,dict):
        for key,value in node.items():
            if key=="routes" and isinstance(value,list):
                yield value
            yield from nested_lists(value)
    elif isinstance(node,list):
        for value in node: yield from nested_lists(value)
live_server,live_route=domain_routes(live)
candidate_server,candidate_route=domain_routes(proposed)
lists=list(nested_lists(live_route))
if not lists:
    raise ValueError("domain route has no nested routes")
old=lists[0]
new_lists=list(nested_lists(candidate_route))
matches=[sum(item in sequence for item in old) for sequence in new_lists]
best=max(matches,default=0)
sequence=new_lists[matches.index(best)] if matches else []
def handlers(node):
    result=[]
    if isinstance(node,dict):
        if isinstance(node.get("handler"),str): result.append(node["handler"])
        for value in node.values(): result.extend(handlers(value))
    elif isinstance(node,list):
        for value in node: result.extend(handlers(value))
    return result
def summary(node):
    if isinstance(node,dict):
        result={}
        for key,value in node.items():
            if key=="logger_names" and isinstance(value,dict):
                result[key]={"host_count":len(value)}
            else:
                result[key]=(value if key=="handler" and isinstance(value,str) else summary(value))
        return result
    if isinstance(node,list):
        return [summary(value) for value in node]
    return type(node).__name__
print("existing_domain_inner_routes",len(old))
print("candidate_exact_existing_routes",best)
print("domain_routes_all_preserved_exactly",best==len(old))
for index,item in enumerate(old):
    if item not in sequence:
        print("unmatched_route_index",index,"handler_types",handlers(item),
              "candidate_same_handler_count",sum(handlers(other)==handlers(item) for other in sequence))
        print("live_route_shape",json.dumps(summary(item),sort_keys=True))
        for other in sequence:
            if set(handlers(item)) & set(handlers(other)):
                print("candidate_related_shape",json.dumps(summary(other),sort_keys=True))
print("server_logs_equal",live_server.get("logs")==candidate_server.get("logs"))
print("live_logs_present",bool(live_server.get("logs")),
      "candidate_logs_present",bool(candidate_server.get("logs")))
print("domain_logger_equal",live_server.get("logs",{}).get("logger_names",{}).get(env["RAKAZO_HOST"])==
      candidate_server.get("logs",{}).get("logger_names",{}).get(env["RAKAZO_HOST"]))
print("logging_configuration_equal",live.get("logging")==proposed.get("logging"))
live_logs=live.get("logging",{}).get("logs",{})
candidate_logs=proposed.get("logging",{}).get("logs",{})
candidate_names=candidate_server.get("logs",{}).get("logger_names",{})
ip_logger=candidate_names.get(ip)
domain_logger=candidate_names.get(env["RAKAZO_HOST"])
def logger_configs(names):
    if isinstance(names,str):
        names=[names]
    if not isinstance(names,list) or not names or any(
        not isinstance(name,str) or name not in candidate_logs for name in names
    ):
        return None
    return sorted(json.dumps(candidate_logs[name],sort_keys=True) for name in names)
ip_configs=logger_configs(ip_logger)
domain_configs=logger_configs(domain_logger)
print("candidate_ip_logger_present",ip_configs is not None)
print("candidate_ip_logger_matches_domain",
      ip_configs is not None and domain_configs is not None and ip_configs==domain_configs)
def differences(left,right,path=""):
    if isinstance(left,dict) and isinstance(right,dict):
        result=[]
        for key in sorted(set(left)|set(right)):
            if key not in left or key not in right:
                result.append(path+"/"+key)
            else:
                result.extend(differences(left[key],right[key],path+"/"+key))
        return result
    return [] if left==right else [path]
if (isinstance(ip_logger,list) and len(ip_logger)==1 and
        isinstance(domain_logger,list) and len(domain_logger)==1 and
        ip_configs is not None and domain_configs is not None):
    changed_paths=differences(candidate_logs[ip_logger[0]],candidate_logs[domain_logger[0]])
    print("candidate_logger_difference_paths",changed_paths)
    print("candidate_logger_settings_match_except_include",
          all(path=="/include" for path in changed_paths))
print("existing_loggers_preserved",all(candidate_logs.get(name)==config for name,config in live_logs.items()))
print("live_loggers_count",len(live_logs),"candidate_loggers_count",len(candidate_logs))
def preserved_except_extra_excludes(old,new):
    if not isinstance(old,dict) or not isinstance(new,dict): return old==new
    old_other={key:value for key,value in old.items() if key!="exclude"}
    new_other={key:value for key,value in new.items() if key!="exclude"}
    return old_other==new_other and set(old.get("exclude",[]))<=set(new.get("exclude",[]))
print("existing_logger_settings_preserved_with_extra_excludes",
      all(preserved_except_extra_excludes(config,candidate_logs.get(name))
          for name,config in live_logs.items()))
for index,(name,config) in enumerate(sorted(live_logs.items())):
    if candidate_logs.get(name)!=config:
        print("unmatched_logger_index",index)
        print("live_logger_shape",json.dumps(summary(config),sort_keys=True))
        print("candidate_logger_shape",json.dumps(summary(candidate_logs.get(name)),sort_keys=True))
print("live_server_logs_shape",json.dumps(summary(live_server.get("logs")),sort_keys=True))
print("candidate_server_logs_shape",json.dumps(summary(candidate_server.get("logs")),sort_keys=True))
print("tls_domain_certificate_equal",certs[0] in proposed.get("apps",{}).get("tls",{}).get("certificates",{}).get("load_files",[]))
print("candidate_http_servers",len(servers(proposed)))
print("candidate_loaded",False)
"""


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Pass the production IPv4 address.")
    address = str(ipaddress.IPv4Address(sys.argv[1]))
    candidate = Path(__file__).with_name("Caddyfile.ip.example").read_bytes()
    payload = json.dumps({"ip": address, "candidate": base64.b64encode(candidate).decode()}).encode()
    encoded = base64.b64encode(REMOTE.encode()).decode()
    code = "import base64;exec(base64.b64decode(%r))" % encoded
    subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15",
         "sydney-cloud-admin", "sudo /usr/bin/python3 -I -c " + shlex.quote(code)],
        input=payload, check=True, timeout=60,
    )


if __name__ == "__main__":
    main()
