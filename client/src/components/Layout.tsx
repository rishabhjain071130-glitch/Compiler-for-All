import { ReactNode } from "react";
import Navbar from "./Navbar.tsx";

interface LayoutProps {
  children: ReactNode;
  controlBar: ReactNode;
}

export default function Layout({ children, controlBar }: LayoutProps) {
  return (
    <div className="app-container">
      {/* Background radial glow */}
      <div className="mesh-bg"></div>

      {/* Navbar Header */}
      <Navbar />

      {/* Workspace Grid */}
      <div className="workspace-grid">{children}</div>

      {/* Action Control Footer */}
      {controlBar}
    </div>
  );
}
