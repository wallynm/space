import spaceIcon from "../../assets/space-icon.png";

export function Mark({ size = 30 }: { size?: number }) {
  return (
    <img
      className="brand-mark select-none"
      src={spaceIcon}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
    />
  );
}
