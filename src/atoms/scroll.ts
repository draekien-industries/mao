import { Atom } from "@effect-atom/atom-react";

export const scrollPositionAtom = Atom.family((_tabId: string) =>
  Atom.make(0).pipe(Atom.keepAlive),
);

export const autoScrollAtom = Atom.family((_tabId: string) =>
  Atom.make(true).pipe(Atom.keepAlive),
);
