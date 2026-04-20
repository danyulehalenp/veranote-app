import { Logo } from "./Logo";

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
        <Logo size="lg" />
      </div>
    );
  }

  return null;
}
