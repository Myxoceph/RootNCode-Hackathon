import { useEffect, useRef, useState } from "react";
import { Animated, Easing, PanResponder, Platform } from "react-native";

import { cue } from "./feedback";
import { settleTurn } from "./journal";

const TURN_MS = 760;
const QUICKEST_MS = 220;
/**
 * How far a finger moves to turn a whole leaf, as a share of its width: a leaf's edge travels its width
 * twice over, to the spine and past it, so this keeps the edge about under the finger.
 */
const DRAG_FORWARD = 1.6;
/** On a phone a leaf comes back from off the screen: a shorter way, or the finger would be far ahead of it. */
const DRAG_BACK_ONE_PAGE = 1;
/** A sideways move this long, and clearly more sideways than down, is a turn and not a scroll. */
const DRAG_START = 12;
const SIDEWAYS = 1.4;
/** A finger still this long before it lifted made no flick, whatever its speed was when it last moved. */
const FLICK_WITHIN_MS = 100;
// Paper lifts gently, crosses quickly and settles slowly.
const easing = Easing.bezier(0.38, 0.04, 0.22, 1);

/**
 * Which leaf is open, and `position`, how far through the book it is: 2.5 is leaf 2 half turned. A
 * finger moves it, and a turn runs on the UI thread, so whatever the pages hold does not slow it.
 * With reduced motion a turn is a jump. `span` is the width of a leaf.
 */
export function usePageTurn({ last, span, reduced, onePage }: { last: number; span: number; reduced: boolean; onePage: boolean }) {
  const position = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);
  /** The leaf the last turn came to rest on: the leaves drawn change only then, so nothing new is laid out in mid-turn. */
  const [settled, setSettled] = useState(0);
  const now = useRef({ index, last, span, reduced, onePage });
  useEffect(() => {
    now.current = { index, last, span, reduced, onePage };
  });

  const run = (target: number, duration: number) => {
    if (now.current.reduced) {
      position.setValue(target);
      setSettled(target);
      return;
    }
    // The web has no native animation driver.
    Animated.timing(position, { toValue: target, duration, easing, useNativeDriver: Platform.OS !== "web" }).start(({ finished }) => {
      if (finished) setSettled(target);
    });
  };

  const turnTo = (target: number) => {
    const next = Math.max(0, Math.min(target, now.current.last));
    if (next !== now.current.index) cue("pageTurn");
    now.current.index = next;
    setIndex(next);
    run(next, TURN_MS);
  };

  /** To a place without a turn: the book's layout changed, or the page held is gone. */
  const jumpTo = (target: number) => {
    position.stopAnimation();
    position.setValue(target);
    now.current.index = target;
    setIndex(target);
    setSettled(target);
  };

  const drag = useRef({ from: 0, progress: 0, movedAt: 0 });
  const handlers = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, { dx, dy }) => Math.abs(dx) > DRAG_START && Math.abs(dx) > Math.abs(dy) * SIDEWAYS,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        position.stopAnimation();
        drag.current = { from: now.current.index, progress: 0, movedAt: Date.now() };
      },
      onPanResponderMove: (_event, { dx }) => {
        const { from } = drag.current;
        const share = dx > 0 && now.current.onePage ? DRAG_BACK_ONE_PAGE : DRAG_FORWARD;
        const progress = Math.max(-1, Math.min(1, -dx / (now.current.span * share)));
        drag.current.progress = progress;
        drag.current.movedAt = Date.now();
        position.setValue(Math.max(0, Math.min(now.current.last, from + progress)));
      },
      onPanResponderRelease: (_event, { vx }) => {
        const { from, progress, movedAt } = drag.current;
        const target = settleTurn(from, progress, Date.now() - movedAt > FLICK_WITHIN_MS ? 0 : vx, now.current.last);
        const left = Math.abs(target - (from + progress));
        // Let go of past the turning point: the leaf turns on, and is heard to.
        if (target !== from) cue("pageTurn");
        now.current.index = target;
        setIndex(target);
        run(target, Math.max(QUICKEST_MS, TURN_MS * left));
      },
      onPanResponderTerminate: () => {
        const { from } = drag.current;
        run(from, QUICKEST_MS);
      },
    }),
  ).current;

  return { position, index, settled, turnTo, jumpTo, panHandlers: handlers.panHandlers };
}
