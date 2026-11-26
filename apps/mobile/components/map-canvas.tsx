import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import type { GeoPoint } from "../lib/map-location";
import { isValidGeoPoint } from "../lib/map-location";

export type MapTileProvider = "amap" | "osm";

export type MapCanvasMarker = GeoPoint & {
  label?: string;
};

export type MapCanvasRoute = {
  points: readonly GeoPoint[];
  estimated: boolean;
};

export type MapCanvasEvent =
  | { type: "ready" }
  | { type: "tap"; latitude: number; longitude: number }
  | { type: "location"; latitude: number; longitude: number; accuracyMeters?: number }
  | { type: "locationError"; code: number; message: string }
  | { type: "tileFallback"; provider: MapTileProvider };

export type MapCanvasHandle = {
  centerOn: (point: GeoPoint, zoom?: number) => void;
  zoomBy: (delta: number) => void;
  fitRoute: (points: readonly GeoPoint[]) => void;
  requestGpsLocation: () => void;
};

export type MapCanvasProps = {
  origin: MapCanvasMarker | null;
  destination: MapCanvasMarker | null;
  route: MapCanvasRoute | null;
  tileProvider: MapTileProvider;
  dark: boolean;
  interactive?: boolean;
  initialCenter?: GeoPoint | null;
  initialZoom?: number;
  onEvent?: (event: MapCanvasEvent) => void;
};

export const MAP_CANVAS_BASE_URL = "https://sydney-map.local/";

export function isAllowedMapCanvasUrl(url: string): boolean {
  return (
    url === "about:blank" ||
    url === "about:blank/" ||
    url === MAP_CANVAS_BASE_URL ||
    url === MAP_CANVAS_BASE_URL.slice(0, -1)
  );
}

export function parseMapCanvasMessage(raw: string): MapCanvasEvent | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    switch (parsed.type) {
      case "ready":
        return { type: "ready" };
      case "tap": {
        const latitude = Number(parsed.latitude);
        const longitude = Number(parsed.longitude);
        if (!isValidGeoPoint({ latitude, longitude })) return null;
        return { type: "tap", latitude, longitude };
      }
      case "location": {
        const latitude = Number(parsed.latitude);
        const longitude = Number(parsed.longitude);
        if (!isValidGeoPoint({ latitude, longitude })) return null;
        const accuracy = Number(parsed.accuracyMeters);
        return {
          type: "location",
          latitude,
          longitude,
          accuracyMeters: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : undefined,
        };
      }
      case "locationError": {
        const code = Number(parsed.code);
        const message = typeof parsed.message === "string" ? parsed.message.slice(0, 160) : "";
        return {
          type: "locationError",
          code: Number.isFinite(code) ? code : 0,
          message,
        };
      }
      case "tileFallback": {
        const provider =
          parsed.provider === "amap" || parsed.provider === "osm" ? parsed.provider : null;
        return provider ? { type: "tileFallback", provider } : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function buildMapCanvasHtml(options: {
  dark: boolean;
  tileProvider: MapTileProvider;
  interactive?: boolean;
  initialCenter?: GeoPoint | null;
  initialZoom?: number;
  initialOrigin?: MapCanvasMarker | null;
}): string {
  const bg = options.dark ? "#1B1F27" : "#EFECE6";
  const tileFilter = options.dark ? "brightness(0.84) contrast(1.06) saturate(0.88)" : "none";
  const initialProvider = options.tileProvider === "osm" ? "osm" : "amap";
  const interactive = options.interactive !== false;
  const centerPoint =
    options.initialCenter && isValidGeoPoint(options.initialCenter)
      ? { lat: options.initialCenter.latitude, lng: options.initialCenter.longitude }
      : { lat: 39.9042, lng: 116.4074 };
  const initialZoom =
    typeof options.initialZoom === "number" && Number.isFinite(options.initialZoom)
      ? Math.max(3, Math.min(18, options.initialZoom))
      : 14;
  const initialOrigin =
    options.initialOrigin && isValidGeoPoint(options.initialOrigin)
      ? {
          latitude: options.initialOrigin.latitude,
          longitude: options.initialOrigin.longitude,
          label: options.initialOrigin.label,
        }
      : null;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-user-select: none; user-select: none; }
  html, body, #root { width: 100%; height: 100%; overflow: hidden; background: ${bg}; touch-action: none; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; ${interactive ? "" : "pointer-events: none;"} }
  #tiles { position: absolute; inset: 0; overflow: hidden; }
  .tile { position: absolute; left: 0; top: 0; pointer-events: none; filter: ${tileFilter}; image-rendering: -webkit-optimize-contrast; image-rendering: auto; will-change: transform; backface-visibility: hidden; }
  #overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
</style>
</head>
<body>
<div id="root">
  <div id="tiles"></div>
  <canvas id="overlay"></canvas>
</div>
<script>
(function () {
  var PI = Math.PI, A = 6378245.0, EE = 0.00669342162296594323;
  var TILE = 256, MIN_Z = 3, MAX_Z = 18;
  var interactive = ${JSON.stringify(interactive)};
  var provider = ${JSON.stringify(initialProvider)};
  var center = ${JSON.stringify(centerPoint)};
  var zoom = ${JSON.stringify(initialZoom)};
  var originMarker = ${JSON.stringify(initialOrigin)};
  var destMarker = null;
  var routeData = null;
  var tileErrors = 0;
  var fallbackNotified = false;

  var root = document.getElementById("root");
  var tilesEl = document.getElementById("tiles");
  var canvas = document.getElementById("overlay");
  var ctx = canvas.getContext("2d");
  var tileNodes = new Map();

  function post(obj) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    }
  }

  function inChina(lat, lng) {
    return lng >= 72.004 && lng <= 137.8347 && lat >= 0.8293 && lat <= 55.8271;
  }
  function tLat(x, y) {
    var r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    r += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
    r += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3;
    r += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3;
    return r;
  }
  function tLng(x, y) {
    var r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    r += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
    r += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3;
    r += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3;
    return r;
  }
  function wgsToGcj(lat, lng) {
    if (!inChina(lat, lng)) return { lat: lat, lng: lng };
    var dLat = tLat(lng - 105, lat - 35);
    var dLng = tLng(lng - 105, lat - 35);
    var radLat = (lat / 180) * PI;
    var magic = 1 - EE * Math.sin(radLat) * Math.sin(radLat);
    var sqrtMagic = Math.sqrt(magic);
    return {
      lat: lat + (dLat * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI),
      lng: lng + (dLng * 180) / ((A / sqrtMagic) * Math.cos(radLat) * PI)
    };
  }
  function gcjToWgs(lat, lng) {
    if (!inChina(lat, lng)) return { lat: lat, lng: lng };
    var wLat = lat, wLng = lng;
    for (var i = 0; i < 3; i++) {
      var g = wgsToGcj(wLat, wLng);
      wLat += lat - g.lat;
      wLng += lng - g.lng;
    }
    return { lat: wLat, lng: wLng };
  }

  function displayCoord(lat, lng) {
    return provider === "amap" ? wgsToGcj(lat, lng) : { lat: lat, lng: lng };
  }
  function wgsFromDisplay(lat, lng) {
    return provider === "amap" ? gcjToWgs(lat, lng) : { lat: lat, lng: lng };
  }

  function project(lat, lng, z) {
    var clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
    var sin = Math.sin((clampedLat * PI) / 180);
    var scale = TILE * Math.pow(2, z);
    var x = ((lng + 180) / 360) * scale;
    var y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * PI)) * scale;
    return { x: x, y: y };
  }
  function unproject(x, y, z) {
    var scale = TILE * Math.pow(2, z);
    var lng = (x / scale) * 360 - 180;
    var n = PI - (2 * PI * y) / scale;
    var lat = (180 / PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat: lat, lng: lng };
  }

  function tileUrl(z, x, y) {
    if (provider === "amap") {
      var s = ((x + y) & 3) + 1;
      return "https://webrd0" + s + ".is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=2&style=8&x=" + x + "&y=" + y + "&z=" + z;
    }
    return "https://tile.openstreetmap.org/" + z + "/" + x + "/" + y + ".png";
  }

  function screenPointForWgs(lat, lng) {
    var w = root.clientWidth || 360;
    var h = root.clientHeight || 640;
    var dispCenter = displayCoord(center.lat, center.lng);
    var dispPt = displayCoord(lat, lng);
    var cPx = project(dispCenter.lat, dispCenter.lng, zoom);
    var pPx = project(dispPt.lat, dispPt.lng, zoom);
    return { x: pPx.x - cPx.x + w / 2, y: pPx.y - cPx.y + h / 2 };
  }

  function render() {
    var w = root.clientWidth || 360;
    var h = root.clientHeight || 640;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    // Amap scale=2 tiles are 256x256 with 2x-sized typography meant for 128pt Retina cells.
    // Oversampling z+1 on Retina displays eliminates 3x upscaling blur while keeping crisp native label proportions.
    var retinaBoost = provider === "amap" && dpr >= 1.5 ? 1 : 0;
    var zTile = Math.max(MIN_Z, Math.min(MAX_Z, Math.ceil(zoom) + retinaBoost));
    var tileSize = TILE * Math.pow(2, zoom - zTile);
    var maxIndex = Math.pow(2, zTile);
    var dispCenter = displayCoord(center.lat, center.lng);
    var cPx = project(dispCenter.lat, dispCenter.lng, zoom);
    var left = cPx.x - w / 2;
    var top = cPx.y - h / 2;
    var pad = interactive ? 1 : 0;

    var minTX = Math.floor(left / tileSize) - pad;
    var maxTX = Math.floor((left + w) / tileSize) + pad;
    var minTY = Math.max(0, Math.floor(top / tileSize) - pad);
    var maxTY = Math.min(maxIndex - 1, Math.floor((top + h) / tileSize) + pad);
    function snap(px) { return Math.round(px * dpr) / dpr; }

    var needed = new Set();
    for (var tx = minTX; tx <= maxTX; tx++) {
      var wrappedX = ((tx % maxIndex) + maxIndex) % maxIndex;
      for (var ty = minTY; ty <= maxTY; ty++) {
        var key = provider + ":" + zTile + ":" + tx + ":" + ty;
        needed.add(key);
        var img = tileNodes.get(key);
        if (!img) {
          img = document.createElement("img");
          img.className = "tile";
          img.alt = "";
          img.decoding = "async";
          img.onerror = function () {
            tileErrors++;
            if (tileErrors >= 6 && !fallbackNotified) {
              fallbackNotified = true;
              post({ type: "tileFallback", provider: provider });
            }
          };
          img.src = tileUrl(zTile, wrappedX, ty);
          tilesEl.appendChild(img);
          tileNodes.set(key, img);
        }
        var x0 = snap(tx * tileSize - left);
        var y0 = snap(ty * tileSize - top);
        var x1 = snap((tx + 1) * tileSize - left);
        var y1 = snap((ty + 1) * tileSize - top);
        img.style.width = (x1 - x0) + "px";
        img.style.height = (y1 - y0) + "px";
        img.style.transform = "translate3d(" + x0 + "px," + y0 + "px,0)";
      }
    }
    tileNodes.forEach(function (node, key) {
      if (!needed.has(key)) {
        node.remove();
        tileNodes.delete(key);
      }
    });

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (routeData && routeData.points && routeData.points.length >= 2) {
      ctx.save();
      ctx.beginPath();
      for (var i = 0; i < routeData.points.length; i++) {
        var pt = screenPointForWgs(routeData.points[i].latitude, routeData.points[i].longitude);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (!routeData.estimated) {
        ctx.lineWidth = 7.5;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
        ctx.stroke();
      }
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = routeData.estimated ? "rgba(37, 99, 235, 0.78)" : "#2563EB";
      if (routeData.estimated) ctx.setLineDash([8, 8]);
      ctx.stroke();
      ctx.restore();
    }

    if (originMarker) {
      var op = screenPointForWgs(originMarker.latitude, originMarker.longitude);
      ctx.save();
      ctx.beginPath();
      ctx.arc(op.x, op.y, 16, 0, PI * 2);
      ctx.fillStyle = "rgba(37, 99, 235, 0.22)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(op.x, op.y, 7, 0, PI * 2);
      ctx.fillStyle = "#2563EB";
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#FFFFFF";
      ctx.stroke();
      ctx.restore();
    }

    if (destMarker) {
      var dp = screenPointForWgs(destMarker.latitude, destMarker.longitude);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(dp.x, dp.y + 1, 7, 3, 0, 0, PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(dp.x, dp.y);
      ctx.bezierCurveTo(dp.x - 13, dp.y - 14, dp.x - 13, dp.y - 30, dp.x, dp.y - 30);
      ctx.bezierCurveTo(dp.x + 13, dp.y - 30, dp.x + 13, dp.y - 14, dp.x, dp.y);
      ctx.fillStyle = "#C94A38";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#FFFFFF";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(dp.x, dp.y - 19, 4, 0, PI * 2);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.restore();
    }
  }

  function clampZoom(z) { return Math.max(MIN_Z, Math.min(MAX_Z, z)); }

  if (interactive) {
    var drag = null;
    var pinch = null;
    var lastTapTime = 0;

    function touchDist(t1, t2) {
      var dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    root.addEventListener("touchstart", function (e) {
      if (e.touches.length === 1) {
        var t = e.touches[0];
        var dispC = displayCoord(center.lat, center.lng);
        var cPx = project(dispC.lat, dispC.lng, zoom);
        drag = { x: t.clientX, y: t.clientY, startX: t.clientX, startY: t.clientY, cx: cPx.x, cy: cPx.y, moved: false };
        pinch = null;
      } else if (e.touches.length === 2) {
        drag = null;
        pinch = { dist: touchDist(e.touches[0], e.touches[1]), zoom: zoom };
      }
    }, { passive: true });

    root.addEventListener("touchmove", function (e) {
      if (e.touches.length === 1 && drag) {
        var t = e.touches[0];
        var dx = t.clientX - drag.startX, dy = t.clientY - drag.startY;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) drag.moved = true;
        var disp = unproject(drag.cx - dx, drag.cy - dy, zoom);
        center = wgsFromDisplay(disp.lat, disp.lng);
        render();
      } else if (e.touches.length === 2 && pinch) {
        var d = touchDist(e.touches[0], e.touches[1]);
        if (pinch.dist > 0) {
          zoom = clampZoom(pinch.zoom + Math.log2(d / pinch.dist));
          render();
        }
      }
    }, { passive: true });

    root.addEventListener("touchend", function (e) {
      if (drag && !drag.moved && e.touches.length === 0) {
        var now = Date.now();
        var rect = root.getBoundingClientRect();
        var tapX = drag.startX - rect.left;
        var tapY = drag.startY - rect.top;
        if (now - lastTapTime < 280) {
          zoom = clampZoom(zoom + 1);
          render();
          lastTapTime = 0;
        } else {
          lastTapTime = now;
          var dispC = displayCoord(center.lat, center.lng);
          var cPx = project(dispC.lat, dispC.lng, zoom);
          var w = root.clientWidth || 360;
          var h = root.clientHeight || 640;
          var dispTap = unproject(cPx.x - w / 2 + tapX, cPx.y - h / 2 + tapY, zoom);
          var wgsTap = wgsFromDisplay(dispTap.lat, dispTap.lng);
          post({ type: "tap", latitude: wgsTap.lat, longitude: wgsTap.lng });
        }
      }
      if (e.touches.length === 0) { drag = null; pinch = null; }
    }, { passive: true });
  }

  window.addEventListener("resize", render);

  window.__sydneyMap = {
    setState: function (next) {
      if (next.provider && next.provider !== provider) {
        provider = next.provider;
        tileErrors = 0;
        fallbackNotified = false;
        tileNodes.forEach(function (n) { n.remove(); });
        tileNodes.clear();
      }
      originMarker = next.origin || null;
      destMarker = next.destination || null;
      routeData = next.route || null;
      render();
    },
    centerOn: function (lat, lng, nextZoom) {
      center = { lat: lat, lng: lng };
      if (typeof nextZoom === "number") zoom = clampZoom(nextZoom);
      render();
    },
    zoomBy: function (delta) {
      zoom = clampZoom(zoom + delta);
      render();
    },
    fitPoints: function (points) {
      if (!Array.isArray(points) || points.length === 0) return;
      var minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
      for (var i = 0; i < points.length; i++) {
        var p = points[i];
        if (p.latitude < minLat) minLat = p.latitude;
        if (p.latitude > maxLat) maxLat = p.latitude;
        if (p.longitude < minLng) minLng = p.longitude;
        if (p.longitude > maxLng) maxLng = p.longitude;
      }
      center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
      var span = Math.max(maxLat - minLat, maxLng - minLng);
      zoom = span < 0.005 ? 16 : span < 0.02 ? 14 : span < 0.08 ? 12 : span < 0.3 ? 10 : span < 1.2 ? 8 : 6;
      render();
    },
    requestGps: function () {
      if (!navigator.geolocation || !navigator.geolocation.getCurrentPosition) {
        post({ type: "locationError", code: 0, message: "unsupported" });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          post({
            type: "location",
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyMeters: pos.coords.accuracy
          });
        },
        function (err) {
          post({ type: "locationError", code: err && err.code ? err.code : 1, message: (err && err.message) || "denied" });
        },
        { enableHighAccuracy: true, timeout: 7000, maximumAge: 30000 }
      );
    }
  };

  render();
  post({ type: "ready" });
})();
</script>
</body>
</html>`;
}

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
  {
    origin,
    destination,
    route,
    tileProvider,
    dark,
    interactive = true,
    initialCenter,
    initialZoom,
    onEvent,
  },
  ref,
) {
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const seedRef = useRef({ initialCenter, initialZoom, origin, tileProvider });
  seedRef.current = { initialCenter, initialZoom, origin, tileProvider };

  const html = useMemo(() => {
    readyRef.current = false;
    const seed = seedRef.current;
    return buildMapCanvasHtml({
      dark,
      tileProvider: seed.tileProvider,
      interactive,
      initialCenter: seed.initialCenter ?? seed.origin,
      initialZoom: seed.initialZoom,
      initialOrigin: seed.origin,
    });
  }, [dark, interactive]);

  const sendJs = (script: string) => {
    webViewRef.current?.injectJavaScript(`${script};true;`);
  };

  const syncState = () => {
    if (!readyRef.current) return;
    const payload = JSON.stringify({
      provider: tileProvider,
      origin,
      destination,
      route,
    });
    sendJs(`window.__sydneyMap && window.__sydneyMap.setState(${payload})`);
  };

  useEffect(() => {
    syncState();
  }, [origin, destination, route, tileProvider]);

  useImperativeHandle(ref, () => ({
    centerOn: (point, zoom) => {
      if (!isValidGeoPoint(point)) return;
      const zArg = typeof zoom === "number" ? String(zoom) : "undefined";
      sendJs(
        `window.__sydneyMap && window.__sydneyMap.centerOn(${point.latitude}, ${point.longitude}, ${zArg})`,
      );
    },
    zoomBy: (delta) => {
      sendJs(`window.__sydneyMap && window.__sydneyMap.zoomBy(${delta})`);
    },
    fitRoute: (points) => {
      const valid = points.filter((p) => isValidGeoPoint(p));
      if (valid.length === 0) return;
      sendJs(`window.__sydneyMap && window.__sydneyMap.fitPoints(${JSON.stringify(valid)})`);
    },
    requestGpsLocation: () => {
      sendJs(`window.__sydneyMap && window.__sydneyMap.requestGps()`);
    },
  }));

  return (
    <View style={styles.container} pointerEvents={interactive ? "auto" : "none"}>
      <WebView
        ref={webViewRef}
        testID="map-canvas-webview"
        source={{ html, baseUrl: MAP_CANVAS_BASE_URL }}
        style={styles.webview}
        javaScriptEnabled
        geolocationEnabled={interactive}
        domStorageEnabled={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        setSupportMultipleWindows={false}
        thirdPartyCookiesEnabled={false}
        sharedCookiesEnabled={false}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        onShouldStartLoadWithRequest={({ url }) => isAllowedMapCanvasUrl(url)}
        onMessage={(event) => {
          const parsed = parseMapCanvasMessage(event.nativeEvent.data);
          if (!parsed) return;
          if (parsed.type === "ready") {
            readyRef.current = true;
            syncState();
          }
          onEventRef.current?.(parsed);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: "transparent" },
});
