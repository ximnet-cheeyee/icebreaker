import { QRCodeSVG } from 'qrcode.react'

interface QRJoinProps {
  roomCode: string
}

export function QRJoin({ roomCode }: QRJoinProps) {
  const joinUrl = `${window.location.origin}/join?room=${roomCode}`

  return (
    <div className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-white/5 border border-white/10">
      <p className="text-sm font-semibold tracking-widest text-white/60 uppercase">Scan to join</p>
      <div className="bg-white p-4 rounded-xl">
        <QRCodeSVG value={joinUrl} size={220} level="M" />
      </div>
      <div className="text-center">
        <p className="text-xs text-white/50 uppercase tracking-widest mb-1">Room</p>
        <p className="text-4xl font-black tracking-[0.3em] text-white">{roomCode}</p>
      </div>
    </div>
  )
}