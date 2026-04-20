import Image from "next/image";

type LogoProps = {
  size?: "sm" | "md" | "lg";
};

export function Logo({ size = "md" }: LogoProps) {
  const sizes = { sm: 140, md: 220, lg: 300 };

  return (
    <Image
      src="/veranote-logo.svg"
      alt="Veranote"
      width={sizes[size]}
      height={sizes[size] / 3}
      priority
      className="object-contain"
    />
  );
}
