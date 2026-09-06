import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/layout/Sidebar";
import Navbar from "../components/layout/Navbar";

export default function MainLayout() {
  const { pathname } = useLocation();

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main">
        <Navbar pathname={pathname} />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
