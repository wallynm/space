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
    <div className="tool-empty">
      {icon}
      <h3>{heading}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
