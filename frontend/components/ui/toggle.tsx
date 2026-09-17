"use client";

/**
 * Przełącznik `role="switch"`. Stan niesie pozycja suwaka ORAZ `aria-checked`,
 * nie sam kolor (DESIGN §9).
 */
export function Toggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => {
        onChange(!checked);
      }}
      className="flex min-h-touch w-full items-center gap-3 py-2 text-left"
    >
      <span className="flex-1">
        <span className="block text-ink">{label}</span>
        {description !== undefined && <span className="meta block">{description}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-[120ms] ${
          checked ? "bg-accent" : "bg-surface-3"
        }`}
      >
        <span
          className={`absolute top-1 size-5 rounded-full transition-transform duration-[120ms] ${
            checked ? "translate-x-6 bg-accent-ink" : "translate-x-1 bg-ink-3"
          }`}
        />
      </span>
    </button>
  );
}
