import React from "react";
import { ThemeToggle } from "@/components/app/ThemeToggle";

/**
 * Two-pane auth layout from the wireframes: form on the left, a founder
 * testimonial on the right (hidden on small screens). Light/minimal.
 */
export const AuthShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="relative grid min-h-screen lg:grid-cols-2">
      <div className="absolute right-5 top-5 z-10">
        <ThemeToggle />
      </div>

      {/* Left: form */}
      <div className="flex items-center justify-center px-6 py-16 sm:px-12">
        <div className="w-full max-w-md">{children}</div>
      </div>

      {/* Right: testimonial */}
      <div className="hidden flex-col justify-start gap-8 bg-muted/40 px-12 py-20 lg:flex">
        <div className="max-w-md">
          <div className="mb-5 text-4xl leading-none text-muted-foreground">&#8220;</div>
          <p className="text-2xl font-medium leading-snug text-foreground">
            Devlabs enabled us to hire 10 senior product leaders in no time. It&apos;s
            surprisingly good as well as fast.
          </p>
          <div className="mt-6">
            <p className="font-semibold text-foreground">Rob Dumbleton</p>
            <p className="text-sm text-muted-foreground">Co-founder, Four/Four</p>
          </div>
        </div>
        <div className="mt-4 aspect-[4/3] w-full max-w-xl rounded-2xl bg-muted" />
      </div>
    </div>
  );
};

export default AuthShell;
