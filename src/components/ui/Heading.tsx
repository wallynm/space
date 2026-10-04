import type { ReactNode } from "react";

export function Heading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading flex items-center justify-between gap-5 mb-7">
      <div>
        <div className="eyebrow font-mono text-[9px] tracking-[1.6px] font-normal text-[#768773]">
          {eyebrow}
        </div>
        <h1 className="text-[30px] font-medium tracking-[-1.2px] leading-[1.18] my-2.5">
          {title}
          <span className="text-[#78a574]">.</span>
        </h1>
        <p className="text-xs text-muted m-0">{description}</p>
      </div>
      {action}
    </div>
  );
}
