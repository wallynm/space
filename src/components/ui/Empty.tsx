import type { ReactNode } from "react";

export function Empty({
  icon,
  heading,
  description,
  children,
}: {
  icon: ReactNode;
  heading: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="tool-empty min-h-[280px] flex flex-col items-center justify-center text-center bg-[#fafbf7] border border-dashed border-[#d8e0d6] rounded-[15px] p-8 gap-3 [&>svg]:text-[#73907a] [&>svg]:mb-1.5">
      {icon}
      <h3 className="text-xl font-medium m-0 text-ink">{heading}</h3>
      <p className="text-muted max-w-[480px] leading-[1.7] m-0 mb-2 text-sm">{description}</p>
      {children}
    </div>
  );
}
