import { clx } from "@medusajs/ui";
import type { SelectHTMLAttributes } from "react";

/**
 * A plain select styled like the dashboard inputs. Used inside tables and
 * long forms, where the Radix select of @medusajs/ui is heavier than needed.
 */
export const NativeSelect = ({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className={clx(
      "bg-ui-bg-field shadow-borders-base txt-compact-small text-ui-fg-base h-8 rounded-md px-2 outline-none",
      "focus-visible:shadow-borders-interactive-with-active disabled:text-ui-fg-disabled",
      className,
    )}
  />
);
