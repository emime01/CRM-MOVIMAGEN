"use client"
import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    const res = await signIn("credentials", { email, password, redirect: false })
    setLoading(false)
    if (res?.error) { setError("Email o contraseña incorrectos") }
    else { router.push("/dashboard") }
  }

  return (
    <div style={{minHeight:"100vh",background:"var(--bg-app)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px"}}>
      <div style={{width:"100%",maxWidth:"400px"}}>
        <div style={{textAlign:"center",marginBottom:"40px"}}>
          <div style={{fontFamily:"Montserrat,sans-serif",fontSize:"28px",fontWeight:"800",color:"var(--orange)",letterSpacing:"-0.5px"}}>MOVIMAGEN</div>
          <div style={{fontSize:"11px",color:"var(--gray-400)",letterSpacing:"2px",textTransform:"uppercase",marginTop:"4px"}}>CRM Interno</div>
        </div>
        <div style={{background:"var(--bg-card)",border:"1px solid var(--gray-200)",borderRadius:"var(--radius)",padding:"32px"}}>
          <h1 style={{fontSize:"18px",fontWeight:"700",color:"var(--gray-800)",marginBottom:"6px"}}>Iniciá sesión</h1>
          <p style={{fontSize:"13px",color:"var(--gray-400)",marginBottom:"28px"}}>Ingresá con tu cuenta de Movimagen</p>
          <form onSubmit={handleSubmit}>
            <div style={{marginBottom:"16px"}}>
              <label style={{display:"block",fontSize:"12px",fontWeight:"600",color:"var(--gray-600)",marginBottom:"6px",textTransform:"uppercase",letterSpacing:"0.5px"}}>Email</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@movimagen.com" required style={{width:"100%",padding:"10px 14px",border:"1px solid var(--gray-200)",borderRadius:"8px",fontSize:"14px",fontFamily:"Montserrat,sans-serif",color:"var(--gray-800)",background:"#fff",outline:"none"}}/>
            </div>
            <div style={{marginBottom:"24px"}}>
              <label style={{display:"block",fontSize:"12px",fontWeight:"600",color:"var(--gray-600)",marginBottom:"6px",textTransform:"uppercase",letterSpacing:"0.5px"}}>Contraseña</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required style={{width:"100%",padding:"10px 14px",border:"1px solid var(--gray-200)",borderRadius:"8px",fontSize:"14px",fontFamily:"Montserrat,sans-serif",color:"var(--gray-800)",background:"#fff",outline:"none"}}/>
            </div>
            {error && <div style={{background:"var(--red-pale)",border:"1px solid #f9c6c6",borderRadius:"8px",padding:"10px 14px",fontSize:"13px",color:"var(--red)",marginBottom:"16px"}}>{error}</div>}
            <button type="submit" disabled={loading} style={{width:"100%",padding:"11px",background:loading?"var(--gray-400)":"var(--orange)",color:"#fff",border:"none",borderRadius:"8px",fontSize:"14px",fontWeight:"600",fontFamily:"Montserrat,sans-serif",cursor:loading?"not-allowed":"pointer"}}>
              {loading ? "Ingresando..." : "Ingresar"}
            </button>
          </form>
        </div>
        <p style={{textAlign:"center",marginTop:"20px",fontSize:"12px",color:"var(--gray-400)"}}>¿Problemas para ingresar? Contactá a administración.</p>
      </div>
    </div>
  )
}
