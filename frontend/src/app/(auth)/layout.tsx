
interface AuthLayoutProps {
  children: React.ReactNode
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
   
    <main className="min-h-screen flex items-center justify-center bg-[#0a0a0a] overflow-hidden relative px-4">

      <div
        className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.07] blur-[100px] pointer-events-none"
        style={{ backgroundColor: "#00c896" }}
      />

      <div
        className="absolute -bottom-40 -right-40 w-[400px] h-[400px] rounded-full opacity-[0.05] blur-[100px] pointer-events-none"
        style={{ backgroundColor: "#00c896" }}
      />

      <div
        className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {children}
      </div>

    </main>
  )
}