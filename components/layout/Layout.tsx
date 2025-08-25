import type { FC, ReactNode } from "react";
import Header from "./Header";

interface Props {
  children: ReactNode;
}

const Layout: FC<Props> = ({ children }) => {
  return (
    <div className="flex flex-col justify-start items-start w-full h-full gap-1">
      <Header />
      <main className="w-full h-full px-2">
        <div className="container mx-auto">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
