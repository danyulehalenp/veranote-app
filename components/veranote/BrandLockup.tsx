import { Logo } from "./Logo";
import { LogoAnimated } from "./LogoAnimated";

type BrandLockupProps = {
  variant: "nav" | "hero";
  subtitle?: string;
};

export function BrandLockup({ variant, subtitle }: BrandLockupProps) {
  if (variant === "nav") {
    return (
      <div className="flex flex-col items-start leading-none">
        <Logo size="md" />

        {subtitle && (
          <span className="mt-1 text-[11px] tracking-wide text-[#D8FBFF]/50">
            {subtitle}
          </span>
        )}
      </div>
    );
  }

  if (variant === "hero") {
    return (
      <div className="space-y-4">
        <div className="relative inline-flex">
          <div className="pointer-events-none absolute inset-[-14px] rounded-[28px] bg-[radial-gradient(circle_at_center,rgba(87,237,255,0.24),rgba(87,237,255,0.08)_44%,transparent_76%)] blur-xl" />
          <div className="relative px-3 py-2">
            <LogoAnimated />
          </div>
        </div>
      </div>
    );
  }

  return null;
}
