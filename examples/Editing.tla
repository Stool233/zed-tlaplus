------------------------------ MODULE Editing ------------------------------
EXTENDS Naturals, Sequences, FiniteSets

CONSTANT Capacity
VARIABLE queue

\* Appends an item to the queue. Hover to see this comment and the definition.
Enqueue(items, item) == Append(items, item)

Init == queue = <<>>
Next == \E item \in 1..Capacity : queue' = Enqueue(queue, item)

\* Len and Cardinality navigate to the bundled official standard modules.
QueueLength == Len(queue)
DistinctItems == Cardinality({queue[i] : i \in DOMAIN queue})

\* Type Library! to complete exported members of the module instance.
Library == INSTANCE Sequences
Example == Library!Append(<<1>>, 2)

\* Parameter help includes higher-order parameters such as Test(_).
PositiveItems == SelectSeq(queue, LAMBDA item : item > 0)
=============================================================================
