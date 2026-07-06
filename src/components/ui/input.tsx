import * as React from "react"

import { cn } from "@/lib/utils"

const baseClass = "file:text-primary placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-12 w-full min-w-0 rounded-md border bg-transparent px-4 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-primary/10 file:text-sm file:font-bold file:rounded-md file:h-12 file:px-5 file:py-3 file:mr-4 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/20 focus-visible:ring-[2px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, value, onChange, onFocus, onBlur, ...props }, ref) => {
    const isNumber = type === 'number';

    // For number inputs: keep internal string state so the field can be fully empty.
    // We don't sync from the parent while the user is focused — prevents the "snap back to 0" problem.
    const focused = React.useRef(false);
    const [localVal, setLocalVal] = React.useState<string>(
      isNumber ? (value !== undefined && value !== null ? String(value) : '') : ''
    );

    React.useEffect(() => {
      if (isNumber && !focused.current) {
        setLocalVal(value !== undefined && value !== null ? String(value) : '');
      }
    }, [value, isNumber]);

    if (isNumber) {
      return (
        <input
          type="text"
          inputMode="numeric"
          data-slot="input"
          ref={ref}
          value={localVal}
          onFocus={(e) => { focused.current = true; onFocus?.(e); }}
          onBlur={(e) => {
            focused.current = false;
            // On blur: re-sync from parent so display stays consistent
            setLocalVal(value !== undefined && value !== null ? String(value) : '');
            onBlur?.(e);
          }}
          onChange={(e) => {
            const raw = e.target.value;
            // Allow empty, digits, one decimal point, optional leading minus
            if (raw === '' || /^-?\d*\.?\d*$/.test(raw)) {
              setLocalVal(raw);
              onChange?.(e);
            }
          }}
          className={cn(baseClass, className)}
          {...props}
        />
      );
    }

    return (
      <input
        type={type}
        data-slot="input"
        ref={ref}
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        className={cn(
          baseClass,
          type === "file" ? "p-0 border-dashed flex" : "",
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
