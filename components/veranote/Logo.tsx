type LogoProps = {
  size?: "sm" | "md" | "lg";
};

export function Logo({ size = "md" }: LogoProps) {
  const sizes = { sm: 140, md: 220, lg: 300 };

  return (
    <img
      src="/veranote-logo.svg"
      alt="Veranote"
      width={sizes[size]}
      height={sizes[size] / 3}
      className="object-contain"
      style={{ width: `${sizes[size]}px`, height: "auto" }}
    />
  );
}
