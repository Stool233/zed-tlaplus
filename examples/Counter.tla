------------------------------ MODULE Counter ------------------------------
EXTENDS Naturals

CONSTANT Max
VARIABLE count

vars == <<count>>

ASSUME Max \in Nat

Init == count = 0

Increment ==
    /\ count < Max
    /\ count' = count + 1

Reset ==
    /\ count = Max
    /\ count' = 0

Next == Increment \/ Reset

Spec == Init /\ [][Next]_vars

TypeOK == count \in 0..Max

THEOREM Safety == Spec => []TypeOK
=============================================================================
