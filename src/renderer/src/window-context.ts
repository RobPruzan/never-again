import { createContext, Ref, RefObject, useContext } from "react";

export const WindowContext = createContext<{winRef: RefObject<Window | null>}>(null!)
export const useWindowContext = () => useContext(WindowContext)