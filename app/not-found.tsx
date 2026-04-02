import { cn } from "@/lib/utils";
import Link from "next/link";
import "./(themes)/neue/styles/neue.css";
import { SOCIALS } from "@/types/consts";

export default function NotFound() {
  return (
    <main className="flex-1 w-full py-10 pb-12 flex flex-col gap-10 tablet:gap-20 font-semibold">
      <section className="flex flex-col gap-1">
        {/* <div className="col-start-2 col-span-6 text-8xl">しん の じかん</div> */}
        <div
          className={cn(
            "p-5 col-span-3 text-5xl text-center w-full flex items-center justify-between",
            "py-10",
            " tablet:text-[11rem]",
            "laptop:col-span-full",
          )}
          style={{
            textBox: "trim-both",
            // fontSize: "clamp(3.125rem, 3.464vw + 2.229rem, 5rem)",
          }}
        >
          <span>(</span>
          {"利用不可".split("").map((c, i) => (
            <span key={i}>{c}</span>
          ))}
          <span>)</span>
          {/* シン ノ ジカン */}
          {/* シンタイヨウジ */}
        </div>
        <div className="neue-grid ">
          <div
            className={cn(
              " tablet:justify-self-end tablet:text-right",
              "laptop:col-start-2",
            )}
            title="english"
          >
            [ 404 :
          </div>
          <div className="tablet:col-start-2 laptop:col-start-3 col-span-2">
            This page doesn't exist ]
          </div>
          <div
            className={cn(
              "col-start-2 col-span-2",
              "tablet:col-start-4 flex flex-col max-tablet:order-1",
              "laptop:col-start-6",
            )}
          >
            <Link href={"/"} title="家に帰る">
              / Go back home
            </Link>
            {Object.entries(SOCIALS)
              .reverse()
              .map(([key, { label, link }]) => (
                <Link
                  key={key}
                  href={link}
                  rel="noreferrer nofollow"
                  target="_blank"
                  className="whitespace-nowrap shrink-0"
                >
                  / {label} ↗
                </Link>
              ))}
          </div>
        </div>
      </section>
    </main>
  );
}
