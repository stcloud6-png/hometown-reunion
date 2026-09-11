import { useEffect, useState } from "react";
import { storage } from "@/lib/reunion";

const KEY = "hr-dark-mode";

export function useDarkMode() {
  const [dark, setDark] = useState<boolean>(() => storage.get<boolean>(KEY) ?? false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    storage.set(KEY, dark);
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}
