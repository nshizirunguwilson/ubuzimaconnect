"use client";

/**
 * From ElevenLabs UI (https://ui.elevenlabs.io, MIT licence, Copyright (c) 2025 Eleven Labs Inc.), DECISIONS.md D78.
 * One hidden <audio> for a whole chat, so starting a voice note pauses the one playing. Changed here: our Button and
 * icons; the speed menu and sample tracks are left out; the progress bar and time follow one item, and take the
 * length we already know, as a recording from the browser often reports no duration until it has played through.
 */
import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import { LuPause, LuPlay } from "react-icons/lu";
import { cn } from "@/lib/cn";
import { Button } from "./button";

enum ReadyState {
  HAVE_FUTURE_DATA = 3,
}
enum NetworkState {
  NETWORK_LOADING = 2,
}

export function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? `0${secs}` : secs}`;
}

export interface AudioPlayerItem {
  id: string | number;
  src: string;
}

interface AudioPlayerApi {
  ref: RefObject<HTMLAudioElement | null>;
  activeItem: AudioPlayerItem | null;
  duration: number | undefined;
  error: MediaError | null;
  isPlaying: boolean;
  isBuffering: boolean;
  isItemActive: (id: string | number | null) => boolean;
  play: (item?: AudioPlayerItem | null) => Promise<void>;
  pause: () => void;
  seek: (time: number) => void;
}

const AudioPlayerContext = createContext<AudioPlayerApi | null>(null);
const AudioPlayerTimeContext = createContext<number | null>(null);

export function useAudioPlayer(): AudioPlayerApi {
  const api = useContext(AudioPlayerContext);
  if (!api) throw new Error("useAudioPlayer cannot be called outside of AudioPlayerProvider");
  return api;
}

export function useAudioPlayerTime() {
  const time = useContext(AudioPlayerTimeContext);
  if (time === null) throw new Error("useAudioPlayerTime cannot be called outside of AudioPlayerProvider");
  return time;
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const itemRef = useRef<AudioPlayerItem | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const [readyState, setReadyState] = useState(0);
  const [networkState, setNetworkState] = useState(0);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [error, setError] = useState<MediaError | null>(null);
  const [activeItem, setActiveItem] = useState<AudioPlayerItem | null>(null);
  const [paused, setPaused] = useState(true);

  const play = useCallback(
    async (item?: AudioPlayerItem | null) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (playPromiseRef.current) await playPromiseRef.current.catch(() => {});
      if (item !== undefined && item?.id !== activeItem?.id) {
        itemRef.current = item;
        setActiveItem(item);
        if (!audio.paused) audio.pause();
        audio.currentTime = 0;
        if (item === null) audio.removeAttribute("src");
        else audio.src = item.src;
        audio.load();
      }
      const p = audio.play();
      playPromiseRef.current = p;
      setPaused(false); // starts the frame loop below
      return p;
    },
    [activeItem],
  );

  const pause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playPromiseRef.current) await playPromiseRef.current.catch(() => {});
    audio.pause();
    playPromiseRef.current = null;
  }, []);

  const seek = useCallback((t: number) => {
    if (audioRef.current) audioRef.current.currentTime = t;
    setTime(t);
  }, []);

  const isItemActive = useCallback((id: string | number | null) => activeItem?.id === id, [activeItem]);

  // Only while a note plays: an idle chat doesn't redraw every frame. The loop stops itself when the audio pauses or ends.
  useAnimationFrame(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setActiveItem(itemRef.current);
    setReadyState(audio.readyState);
    setNetworkState(audio.networkState);
    setTime(audio.currentTime);
    setDuration(audio.duration);
    setPaused(audio.paused);
    setError(audio.error);
  }, activeItem !== null && !paused);

  const isPlaying = !paused;
  const isBuffering = readyState < ReadyState.HAVE_FUTURE_DATA && networkState === NetworkState.NETWORK_LOADING;

  const api = useMemo<AudioPlayerApi>(
    () => ({ ref: audioRef, duration, error, isPlaying, isBuffering, activeItem, isItemActive, play, pause, seek }),
    [duration, error, isPlaying, isBuffering, activeItem, isItemActive, play, pause, seek],
  );

  return (
    <AudioPlayerContext.Provider value={api}>
      <AudioPlayerTimeContext.Provider value={time}>
        <audio
          ref={audioRef}
          className="hidden"
          preload="none"
          onEnded={(e) => {
            // Back to the start when a note finishes, ready to play again.
            e.currentTarget.currentTime = 0;
            setTime(0);
            setPaused(true);
          }}
        />
        {children}
      </AudioPlayerTimeContext.Provider>
    </AudioPlayerContext.Provider>
  );
}

/** A seek bar for one item: empty until that item plays, then it follows it. Space plays and pauses. */
export function AudioPlayerProgress({
  item,
  duration: known,
  className,
  ...rest
}: Omit<ComponentProps<typeof SliderPrimitive.Root>, "min" | "max" | "value"> & { item: AudioPlayerItem; duration: number }) {
  const player = useAudioPlayer();
  const time = useAudioPlayerTime();
  const active = player.isItemActive(item.id);
  const wasPlaying = useRef(false);
  const duration = active && player.duration && Number.isFinite(player.duration) ? player.duration : known;

  return (
    <SliderPrimitive.Root
      {...rest}
      value={[active ? Math.min(time, duration) : 0]}
      min={0}
      max={duration}
      step={0.1}
      onValueChange={([v]) => {
        if (active) player.seek(v);
      }}
      onPointerDown={() => {
        wasPlaying.current = active && player.isPlaying;
        if (active) player.pause();
      }}
      onPointerUp={() => {
        if (wasPlaying.current) void player.play();
      }}
      onKeyDown={(e) => {
        if (e.key !== " ") return;
        e.preventDefault();
        if (active && player.isPlaying) player.pause();
        else void player.play(item);
      }}
      disabled={!active}
      className={cn("group/player relative flex h-5 touch-none items-center select-none", className)}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-gray-200">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label="Seek"
        className="block size-3 rounded-full bg-primary opacity-0 group-hover/player:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
    </SliderPrimitive.Root>
  );
}

/** Time played of this item, or its length while it isn't playing. */
export function AudioPlayerTime({ item, duration, className }: { item: AudioPlayerItem; duration: number; className?: string }) {
  const player = useAudioPlayer();
  const time = useAudioPlayerTime();
  const active = player.isItemActive(item.id) && (player.isPlaying || time > 0);
  return <span className={cn("text-caption text-fg-secondary tabular-nums", className)}>{formatTime(active ? time : duration)}</span>;
}

export function AudioPlayerButton({
  item,
  labels = { play: "Play", pause: "Pause" },
  ...rest
}: Omit<ComponentProps<typeof Button>, "onClick" | "children"> & { item: AudioPlayerItem; labels?: { play: string; pause: string } }) {
  const player = useAudioPlayer();
  const playing = player.isItemActive(item.id) && player.isPlaying;
  return (
    <Button
      {...rest}
      type="button"
      aria-label={playing ? labels.pause : labels.play}
      loading={player.isItemActive(item.id) && player.isBuffering && player.isPlaying}
      onClick={() => (playing ? player.pause() : void player.play(item))}
    >
      {playing ? <LuPause /> : <LuPlay />}
    </Button>
  );
}

function useAnimationFrame(callback: () => void, running: boolean) {
  const ref = useRef(callback);
  useEffect(() => {
    ref.current = callback;
  }, [callback]);
  useEffect(() => {
    if (!running) return;
    let id = requestAnimationFrame(function tick() {
      ref.current();
      id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [running]);
}
