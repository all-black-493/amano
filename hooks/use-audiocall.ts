"use client";

import { useEffect, useRef, useState } from "react";
import Peer from "simple-peer";
import { realtime } from "@/lib/realtime";

export interface UseAudioCallOpts {
    roomId: string;
    myId: string;
    onCallEnded?: () => void;
}

export function useAudioCall({ roomId, myId, onCallEnded }: UseAudioCallOpts) {
    const [peer, setPeer] = useState<Peer.Instance | null>(null);
    const localAudioRef = useRef<HTMLAudioElement | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
    const [callActive, setCallActive] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const safeEmit = async (signal: any) => {
        try {
            setError(null);
            console.log(`[WebRTC] Emitting signal to room: ${roomId}`, {
                from: myId,
                signalType: signal.type
            });

            const result = await realtime.channel(roomId).emit("webrtc.signal", {
                roomId,
                from: myId,
                signal,
            });

            console.log("[WebRTC] Signal emitted successfully:", result);
            return result;
        } catch (err: any) {
            console.error("[WebRTC] Failed to emit signal:", err);

            // Check if it's the JSON parse error
            if (err.message?.includes("Unable to parse response body") ||
                err.message?.includes("JSON parse error")) {
                setError("Connection error: Cannot connect to signaling server. Check your network or Upstash configuration.");
            } else {
                setError(`Connection error: ${err.message || "Unknown error"}`);
            }

            return null;
        }
    };

    useEffect(() => {
        console.log(`[WebRTC] Subscribing to room: ${roomId}`);

        const unsub = realtime
            .channel(roomId)
            .subscribe({
                events: ["webrtc.signal"],
                onData: ({ event, data }) => {
                    if (event !== "webrtc.signal") return;
                    const { from, signal } = data;
                    if (from === myId) return;

                    console.log(`[WebRTC] Received signal from: ${from}`);

                    // respond: create peer if we don't have one yet
                    if (!peer) {
                        navigator.mediaDevices.getUserMedia({ audio: true, video: false })
                            .then((stream) => {
                                if (localAudioRef.current) {
                                    localAudioRef.current.srcObject = stream;
                                }
                                const p2 = new Peer({
                                    initiator: false,
                                    stream,
                                    config: {
                                        iceServers: [
                                            { urls: "stun:stun.l.google.com:19302" },
                                            { urls: "stun:stun1.l.google.com:19302" },
                                            { urls: "stun:stun2.l.google.com:19302" }
                                        ],
                                    },
                                });

                                p2.on("signal", async (sig) => {
                                    await safeEmit(sig);
                                });

                                p2.on("stream", (remoteStream) => {
                                    console.log("[WebRTC] Received remote stream");
                                    if (remoteAudioRef.current) {
                                        remoteAudioRef.current.srcObject = remoteStream;
                                    }
                                });

                                p2.on("error", (err) => {
                                    console.error("[WebRTC] Peer error (incoming):", err);
                                    setError(`Peer error: ${err.message}`);
                                });

                                p2.on("close", () => {
                                    console.log("[WebRTC] Peer connection closed");
                                    setPeer(null);
                                    setCallActive(false);
                                    if (onCallEnded) onCallEnded();
                                });

                                setPeer(p2);
                                p2.signal(signal);
                                setCallActive(true);
                            })
                            .catch((err) => {
                                console.error("[WebRTC] getUserMedia error (incoming call):", err);
                                setError(`Microphone access denied: ${err.message}`);
                            });
                    } else {
                        peer.signal(signal);
                    }
                },
            });

        return () => {
            console.log(`[WebRTC] Unsubscribing from room: ${roomId}`);
            unsub.catch((err) => console.error("[WebRTC] Unsubscribe error:", err));
        };
    }, [roomId, myId, peer, onCallEnded]);

    const startCall = async () => {
        try {
            setError(null);
            console.log("[WebRTC] Starting call...");

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false,
            });

            console.log("[WebRTC] Media stream obtained");

            if (localAudioRef.current) {
                localAudioRef.current.srcObject = stream;
            }

            const p = new Peer({
                initiator: true,
                stream,
                config: {
                    iceServers: [
                        { urls: "stun:stun.l.google.com:19302" },
                        { urls: "stun:stun1.l.google.com:19302" },
                        { urls: "stun:stun2.l.google.com:19302" }
                    ],
                },
                trickle: true, // Enable trickle ICE for better performance
            });

            p.on("signal", async (signal) => {
                console.log("[WebRTC] Generated signal:", signal.type);
                await safeEmit(signal);
            });

            p.on("connect", () => {
                console.log("[WebRTC] Peer connection established");
                setCallActive(true);
            });

            p.on("stream", (remoteStream) => {
                console.log("[WebRTC] Received remote stream");
                if (remoteAudioRef.current) {
                    remoteAudioRef.current.srcObject = remoteStream;
                }
            });

            p.on("error", (err) => {
                console.error("[WebRTC] Peer error (outgoing):", err);
                setError(`Peer connection error: ${err.message}`);
            });

            p.on("close", () => {
                console.log("[WebRTC] Peer connection closed");
                setPeer(null);
                setCallActive(false);
                if (onCallEnded) onCallEnded();
            });

            setPeer(p);

            // Don't set callActive immediately, wait for connection
            setTimeout(() => {
                if (!callActive) {
                    setCallActive(true);
                }
            }, 1000);

        } catch (err: any) {
            console.error("[WebRTC] getUserMedia error (startCall):", err);
            setError(`Failed to start call: ${err.message}`);
        }
    };

    const hangUp = () => {
        console.log("[WebRTC] Hanging up call");
        peer?.destroy();
        setPeer(null);
        setCallActive(false);
        setError(null);

        if (localAudioRef.current) {
            const s = localAudioRef.current.srcObject as MediaStream;
            if (s) {
                s.getTracks().forEach((t) => t.stop());
            }
            localAudioRef.current.srcObject = null;
        }
        if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = null;
        }
        if (onCallEnded) onCallEnded();
    };

    return {
        localAudioRef,
        remoteAudioRef,
        callActive,
        startCall,
        hangUp,
        error,
    };
}