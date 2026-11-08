export function onboardingLanguage(locale: string | null | undefined): "zh" | "en" {
  return /^en(?:-|$)/i.test(locale ?? "") ? "en" : "zh";
}
