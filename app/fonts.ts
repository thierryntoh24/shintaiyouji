import {
  Geist,
  Geist_Mono,
  Gloock,
  Newsreader,
  Stoke,
  Danfo,
  Faculty_Glyphic,
} from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
});

const danfo = Danfo({
  variable: "--font-danfo",
  subsets: ["latin"],
});
const gloock = Gloock({
  variable: "--font-gloock",
  subsets: ["latin"],
  weight: "400",
});

const stoke = Stoke({
  variable: "--font-stoke",
  subsets: ["latin"],
  weight: "400",
});

const faculty = Faculty_Glyphic({
  variable: "--font-faculty",
  subsets: ["latin"],
  weight: "400",
});

const font = `${geistSans.variable} ${geistMono.variable} ${newsreader.variable} ${gloock.variable} ${stoke.variable} ${faculty.variable} ${danfo.variable} `;

export default font;
