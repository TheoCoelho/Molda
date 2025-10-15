import { useEffect, useRef, useState } from "react";
import { useLocation, useInRouterContext } from "react-router-dom";

function TopProgressBarInner() {
  const location = useLocation();
  const [active, setActive] = useState(false);
  const hideRef = useRef<number | null>(null);

  useEffect(() => {
    if (hideRef.current) window.clearTimeout(hideRef.current);
    setActive(true);
    hideRef.current = window.setTimeout(() => setActive(false), 650);
    return () => {
      if (hideRef.current) window.clearTimeout(hideRef.current);
    };
  }, [location.pathname, location.search, location.hash]);

  return <div className="top-loader" data-active={active ? "true" : "false"} aria-hidden="true" />;
}

export default function TopProgressBar() {
  const inRouter = useInRouterContext();
  if (!inRouter) return null;
  return <TopProgressBarInner />;
}
