import { useEffect, useState } from "react";

export default function Toast({ toast }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className={`toast ${toast?.kind || ""} ${visible ? "show" : ""}`} role="status" aria-live="polite">
      {toast?.msg}
    </div>
  );
}
