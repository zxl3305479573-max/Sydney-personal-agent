import { useLingui } from "@lingui/react/macro";
import { GithubConnectInputSchema } from "@rakazo/contracts";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@rakazo/ui-web";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { errorText } from "../../lib/user-error";

export interface GithubConnectDialogProps {
  open: boolean;
  mode?: "connect" | "replace";
  onOpenChange: (open: boolean) => void;
  onConnect: (token: string) => Promise<void>;
}

export function GithubConnectDialog({
  open,
  mode = "connect",
  onOpenChange,
  onConnect,
}: GithubConnectDialogProps) {
  const { i18n } = useLingui();
  const isZh = (i18n?.locale ?? "zh").startsWith("zh");
  const text = (chinese: string, english: string) => (isZh ? chinese : english);

  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setToken("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      if (submittingRef.current) return;
      setToken("");
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    const trimmed = token.trim();
    const parsed = GithubConnectInputSchema.safeParse({ token: trimmed });
    if (!parsed.success) {
      setError(
        text(
          "请输入格式有效的 GitHub Personal Access Token（至少 10 个字符且不含空白字符）。",
          "Enter a valid GitHub Personal Access Token (at least 10 characters with no whitespace).",
        ),
      );
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    try {
      await onConnect(parsed.data.token);
      if (mountedRef.current) {
        setToken("");
        setError(null);
        setSubmitting(false);
      }
      submittingRef.current = false;
      onOpenChange(false);
    } catch (cause) {
      submittingRef.current = false;
      if (mountedRef.current) {
        setSubmitting(false);
        setError(
          errorText(
            cause,
            text(
              "无法验证 GitHub Token，请检查令牌是否有效且未过期。",
              "Could not verify the GitHub token. Check that it is valid and unexpired.",
            ),
          ),
        );
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="github-connect-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound size={18} aria-hidden="true" />
            {mode === "replace"
              ? text("更换 GitHub Token", "Replace GitHub Token")
              : text("连接 GitHub Token", "Connect GitHub Token")}
          </DialogTitle>
          <DialogDescription>
            {text(
              "令牌仅在服务端加密保存，用于只读浏览个人主页、远端仓库及为 Bot 提供只读代码检索工具，不会写入浏览器本地存储。",
              "Your token is encrypted on the server and used strictly for read-only profile, repository browsing, and bot read-only code inspection tools.",
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-4">
          <div className="grid gap-2">
            <label htmlFor="github-pat-input" className="text-sm font-medium text-foreground">
              {text("Personal Access Token", "Personal Access Token")}
            </label>
            <Input
              id="github-pat-input"
              name="github-pat"
              type="password"
              autoComplete="off"
              spellCheck={false}
              disabled={submitting}
              value={token}
              placeholder={text(
                "粘贴 github_pat_... 或 ghp_...",
                "Paste github_pat_... or ghp_...",
              )}
              onChange={(event) => {
                setToken(event.target.value);
                if (error) setError(null);
              }}
            />
          </div>

          <div className="grid gap-2.5 rounded-xl border border-border bg-muted/40 p-3.5 text-xs leading-relaxed text-muted-foreground">
            <div className="flex items-start gap-2 text-foreground">
              <ShieldCheck
                size={16}
                className="mt-0.5 shrink-0 text-emerald-500"
                aria-hidden="true"
              />
              <span className="font-medium">
                {text("最小权限建议（只读安全边界）", "Least-privilege token guidance")}
              </span>
            </div>
            <div className="grid gap-1.5 ps-6">
              <p className="m-0">
                <strong className="font-medium text-foreground">
                  {text("Fine-grained PAT（推荐）：", "Fine-grained PAT (Recommended): ")}
                </strong>
                {text(
                  "Repository permissions 仅需开启 Metadata (Read-only) 与 Contents (Read-only)，可按需限定单个或全部仓库。",
                  "Grant Repository permissions -> Metadata (Read-only) and Contents (Read-only) only.",
                )}
              </p>
              <p className="m-0">
                <strong className="font-medium text-foreground">
                  {text("Classic PAT（备选）：", "Classic PAT (Alternative): ")}
                </strong>
                {text(
                  "公开主页与公开仓库勾选 read:user；如需查看私有仓库与完整私有贡献计数可勾选 repo。请勿勾选 delete_repo、admin:org 等高危权限。",
                  "Select read:user for public data, or repo to include private repositories and private contribution counts. Avoid delete_repo or admin:org.",
                )}
              </p>
            </div>
          </div>

          {error ? (
            <p role="alert" className="m-0 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
            >
              {text("取消", "Cancel")}
            </Button>
            <Button type="submit" disabled={submitting || !token.trim()}>
              {submitting
                ? text("正在验证…", "Verifying…")
                : mode === "replace"
                  ? text("保存新 Token", "Save new token")
                  : text("验证并连接", "Verify & connect")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
