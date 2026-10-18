----------------------------- MODULE Navigation -----------------------------
EXTENDS Counter

\* Go to Definition on Increment or count jumps to Counter.tla.
Step == Increment
Current == count

\* The instance name jumps here; CounterInstance!Reset jumps to Counter.tla.
CounterInstance == INSTANCE Counter
Restart == CounterInstance!Reset

\* The two x references below have different targets.
Local(x) ==
    LET Twice(y) == y + y
    IN Twice(x)

Bounded == \A x \in {0, 1} : x = x
=============================================================================
