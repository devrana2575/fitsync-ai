import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import Navbar from '../components/common/Navbar';

export default function DashboardLayout() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex-1 lg:ml-72 flex flex-col min-w-0">
        <Navbar onMenuClick={() => setOpen(true)} />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}