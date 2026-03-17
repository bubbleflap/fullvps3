import React from "react";
import { createPortal } from "react-dom";

interface WalletChangeModalProps {
  pendingWallet: string | null;
  currentWallet: string;
  onApprove: () => void;
  onReject: () => void;
}

export function WalletChangeModal({ pendingWallet, currentWallet, onApprove, onReject }: WalletChangeModalProps) {
  if (!pendingWallet) return null;

  const short = (addr: string) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

  const modalContent = (
    <div style={{ position: "fixed", inset: 0, zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }} onClick={onReject} />
      <div style={{ position: "relative", width: "100%", maxWidth: "380px", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "20px", overflow: "hidden", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.6)" }}>
        <div style={{ padding: "28px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f5a623" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="8.5" cy="7" r="4"/>
                <line x1="20" y1="8" x2="20" y2="14"/>
                <line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
            </div>
          </div>

          <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#ffffff", margin: "0 0 8px", textAlign: "center", fontFamily: "'Space Grotesk', sans-serif" }}>
            New Wallet Detected
          </h3>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", margin: "0 0 20px", textAlign: "center", lineHeight: 1.5 }}>
            A different wallet is requesting to connect. Would you like to switch?
          </p>

          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "12px 14px", marginBottom: "12px" }}>
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Current</div>
            <div style={{ fontSize: "13px", fontFamily: "monospace", color: "rgba(255,255,255,0.6)" }}>{short(currentWallet)}</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", margin: "4px 0" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(245,166,35,0.6)" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
            </svg>
          </div>

          <div style={{ background: "rgba(245,166,35,0.05)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "12px", padding: "12px 14px", marginBottom: "24px" }}>
            <div style={{ fontSize: "10px", color: "rgba(245,166,35,0.6)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>New Wallet</div>
            <div style={{ fontSize: "13px", fontFamily: "monospace", color: "#f5a623", fontWeight: 600 }}>{short(pendingWallet)}</div>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={onReject}
              style={{ flex: 1, padding: "12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.7)", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Keep Current
            </button>
            <button
              onClick={onApprove}
              style={{ flex: 1, padding: "12px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg, #f5a623, #d4891a)", color: "#000", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Switch Wallet
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}