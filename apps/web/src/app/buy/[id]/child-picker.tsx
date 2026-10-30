"use client";

import { useState } from "react";

export type ChildOption = { value: string; label: string };

export type PickerText = {
  choose: string;
  existing: string;
  pick: string;
  newChild: string;
  newName: string;
  newBirth: string;
};

// Chooses who the package is for: the account itself, one of its children at this pool, or a new child.
// The new-child fields appear only for "A new child".
export function ChildPicker({
  options,
  initial,
  selfName,
  text,
}: {
  options: ChildOption[];
  initial: string;
  selfName: string | null;
  text: PickerText;
}) {
  const [choice, setChoice] = useState(initial);

  return (
    <>
      <fieldset>
        <legend>{text.choose}</legend>
        <label>
          {text.existing}
          <select name="student_id" value={choice} onChange={(event) => setChoice(event.target.value)} required>
            <option value="" disabled>
              {text.pick}
            </option>
            {selfName && <option value="self">{selfName}</option>}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            <option value="new">{text.newChild}</option>
          </select>
        </label>
      </fieldset>

      {choice === "new" && (
        <fieldset>
          <legend>{text.newChild}</legend>
          <label>
            {text.newName}
            <input name="new_name" autoComplete="off" required />
          </label>
          <label>
            {text.newBirth}
            <input type="date" name="new_birth" required />
          </label>
        </fieldset>
      )}
    </>
  );
}
