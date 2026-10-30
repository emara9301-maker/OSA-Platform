"use client";

import Link from "next/link";
import { useState } from "react";
import { poolPhoto } from "@/lib/pool-photo";
import { nearestCondos } from "@/lib/distance";
import { t, type Lang } from "@/lib/messages";

export type ListedCondo = {
  id: string;
  name: string;
  area: string | null;
  image_url: string | null;
  pool_count: number;
  latitude: number | null;
  longitude: number | null;
};

type Status = "idle" | "locating" | "denied" | "ready";

// Finds the five condos nearest to the visitor. The location is read in the browser and never sent to OSA.
export function NearbyCondos({ lang, condos }: { lang: Lang; condos: ListedCondo[] }) {
  const [status, setStatus] = useState<Status>("idle");
  const [nearest, setNearest] = useState<(ListedCondo & { km: number })[]>([]);

  function findNearby() {
    if (!navigator.geolocation) {
      setStatus("denied");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNearest(
          nearestCondos(condos, { latitude: position.coords.latitude, longitude: position.coords.longitude }, 5),
        );
        setStatus("ready");
      },
      () => setStatus("denied"),
      { timeout: 15000, maximumAge: 300000 },
    );
  }

  return (
    <div className="nearby">
      <h3>{t(lang, "nearTitle")}</h3>
      <p className="pool-area">{t(lang, "nearPrivacy")}</p>

      {status !== "ready" && (
        <button type="button" onClick={findNearby} disabled={status === "locating"}>
          {status === "locating" ? t(lang, "nearLocating") : t(lang, "nearButton")}
        </button>
      )}
      {status === "denied" && <p role="alert">{t(lang, "nearDenied")}</p>}

      {status === "ready" &&
        (nearest.length === 0 ? (
          <p>{t(lang, "nearNone")}</p>
        ) : (
          <div className="pool-grid">
            {nearest.map((condo) => (
              <Link key={condo.id} href={`/sites/${condo.id}`} className="pool-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={poolPhoto(condo.name, condo.image_url)} alt={condo.name} />
                <div className="pool-card-body">
                  <h3>{condo.name}</h3>
                  {condo.area && <p className="pool-area">{condo.area}</p>}
                  <p className="pool-hours">{t(lang, "nearKm", { km: condo.km.toFixed(1) })}</p>
                  <span className="pool-link">{t(lang, "viewPool")} →</span>
                </div>
              </Link>
            ))}
          </div>
        ))}
    </div>
  );
}
