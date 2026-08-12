import Image from "next/image";

type ManishLogoLoaderProps = {
  overlay?: boolean;
};

function LoaderContent() {
  return (
    <div className="relative w-[min(76vw,520px)]">
      <Image
        className="h-auto w-full object-contain"
        src="/icons/manish-logo.png"
        alt="Manish Masala"
        width={520}
        height={360}
        priority
      />

      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 520 360"
        fill="none"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <path
          className="manish-logo-loader-line manish-logo-loader-line-yellow"
          d="M38 0 V292 C168 232 319 208 482 235 V0"
        />
        <path
          className="manish-logo-loader-line manish-logo-loader-line-orange"
          d="M22 0 V329 C154 263 318 238 505 274 V0"
        />
      </svg>
    </div>
  );
}

export function ManishLogoLoader({ overlay = false }: ManishLogoLoaderProps) {
  if (overlay) {
    return (
      <div
        className="fixed inset-0 z-[100] grid min-h-screen place-items-center bg-white p-6"
        role="status"
        aria-label="Loading application"
        aria-live="polite"
      >
        <LoaderContent />
      </div>
    );
  }

  return (
    <main
      className="grid min-h-screen place-items-center bg-white p-6"
      aria-label="Loading application"
    >
      <LoaderContent />
    </main>
  );
}
