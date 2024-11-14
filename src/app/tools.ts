import { u16 } from "./types";

export function random(): u16 {
    return Math.random() * 0xFFFF;
}