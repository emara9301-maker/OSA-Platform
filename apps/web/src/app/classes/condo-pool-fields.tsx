"use client";

import { useState } from "react";

type Condo = { id: string; name: string };
type Pool = { id: string; name: string; condo_id: string };

// Condo first, then the pool. The pool list shows only the chosen condo's pools; with one pool it is chosen automatically.
export function CondoPoolFields({
  condos,
  pools,
  condoId,
  poolId,
}: {
  condos: Condo[];
  pools: Pool[];
  condoId?: string;
  poolId?: string;
}) {
  const [condo, setCondo] = useState(condoId ?? "");
  const [pool, setPool] = useState(poolId ?? "");

  const options = pools.filter((item) => item.condo_id === condo);
  const chosenPool = options.length === 1 ? options[0].id : options.some((item) => item.id === pool) ? pool : "";

  return (
    <>
      <label>
        Condo
        <select name="condo_id" value={condo} onChange={(event) => setCondo(event.target.value)} required>
          <option value="" disabled>
            Choose a condo
          </option>
          {condos.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Pool
        <select
          name="pool_id"
          value={chosenPool}
          onChange={(event) => setPool(event.target.value)}
          disabled={!condo || options.length === 0}
          required
        >
          <option value="" disabled>
            {condo ? "Choose a pool" : "Choose a condo first"}
          </option>
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      {condo && options.length === 0 && <p>This condo has no pools yet. Add a pool to the condo first.</p>}
    </>
  );
}
