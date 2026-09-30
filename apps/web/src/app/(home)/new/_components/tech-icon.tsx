import Image from "next/image";

import { hasLightVariant, isRenderableIconPath, lightVariantSrc } from "@/lib/tech-icon-src";
import { cn } from "@/lib/utils";

export function TechIcon({
  icon,
  name,
  className,
}: {
  icon: string;
  name: string;
  className?: string;
}) {
  if (!icon) return null;

  if (!isRenderableIconPath(icon)) {
    return <span className={cn("inline-flex items-center text-lg", className)}>{icon}</span>;
  }

  if (hasLightVariant(icon)) {
    return (
      <>
        <Image
          suppressHydrationWarning
          src={icon}
          alt={`${name} icon`}
          width={20}
          height={20}
          className={cn("hidden dark:inline-block", className)}
          unoptimized
        />
        <Image
          suppressHydrationWarning
          src={lightVariantSrc(icon)}
          alt={`${name} icon`}
          width={20}
          height={20}
          className={cn("inline-block dark:hidden", className)}
          unoptimized
        />
      </>
    );
  }

  return (
    <Image
      suppressHydrationWarning
      src={icon}
      alt={`${name} icon`}
      width={20}
      height={20}
      className={cn("inline-block", className)}
      unoptimized
    />
  );
}
