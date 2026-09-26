# About ZSS

ZSS (Zantei State Script) is a state description format new to IKEMEN GO that can be used instead of CNS. The basic structure is the same as CNS, but the grammar is significantly different.

Almost all CNS descriptions can be replaced with ZSS, with new features such as local variables and functions. ZSS could be useful for people that:

- Feels that the CNS format is redundant.
- Wants to compress or reuse code.
- Doesn't like to describe complicated processes many times.
- Has programming experience.

common1.cns.zss can be used as a sample. Comparing it to the original common1.cns may help you understand how to use it properly.

If you're using Notepad++, consider installing [ZSS syntax highlighter](https://github.com/ikemen-engine/zss_npp).

Here is a brief manual for those who understand MUGEN CNS.

# Loading ZSS

Specify the ZSS file like any other file in the character DEF's [Files] section. Additionally, characters can mix CNS and ZSS code, as long as they are in separate files.

The file extension describing ZSS is fixed with .zss.

**Example:**
```ini
st1 = kfm.zss
```

It's also possible to load a ZSS file if the referenced file is missing, but the same file name with additional .zss extension is present.

**Example: File name**
```ini
common1.cns.zss
```

**Example: Description in DEF file. (under [Files])**
```ini
stcommon = common1.cns
```

# How to write ZSS

## StateDefs

ZSS is composed of a collection of Statedefs much like CNS. All it's options (parameters) are written inside square/box brackets.

**Example: CNS**
```ini
[Statedef 0]
type = S
physics = S
sprpriority = 0
```

**Example: ZSS**
```ini
[StateDef 0; type: S; physics: S; sprPriority: 0;]
```

To specify a value, write `:` instead of `=`.
Separating parameters is done using `;`. All of these in the Statedef bracket always end using this.

Above example can be also written like this (whitespace doesn't matter):
```c#
[StateDef 0;
  type: S;
  physics: S;
  sprPriority: 0;]
```

Write state code under Statedefs.

## State controllers

**Format:**
`State controller name {parameter name: value}`

State controllers in ZSS are written in a similar format to CNS, but triggers are not part of SCTRL definition.

**Example: CNS**
```ini
[State Sample]
type = PosAdd
trigger1 = 1
x = 10
```

**Example: ZSS**
```c#
posAdd{x: 10}
```

When writing multiple parameters, use `;` to separate them, just like in Statedefs.

**Example: CNS**
```ini
[State Sample]
type = PosAdd
trigger1 = 1
x = 10
y = -10
```

**Example: ZSS**
```c#
posAdd{x: 10; y: -10}
```

**Example: With whitespace**
```c#
posAdd{
    x: 10;
    y: -10;
}
```

On state controllers without parameters, leave the brace brackets inside empty.

**Example:**
```
turn{}
```

## If statement

In the examples so far, nothing is written in the surrounding area, so that the Statedef is executed every frame (like writing "1" as the trigger of any SCTRL in CNS).

ZSS uses `if` statements instead of CNS triggers.  
Usage is roughly the same to the "if" sentences in a typical programming language.

**Format:**
`"if" conditional statement {code to be executed}`

**Example: CNS**
```ini
[State Sample]
type = PosAdd
trigger1 = time = 0
x = 10
```

**Example: ZSS**
```go
if time = 0 {
    posAdd{x: 10}
}
```

`if` uses the same conditional statement as CNS triggers.
If code is added after the conditional statement, and is enclosed in `{}`. The code within it is executed only while the `if` condition is satisfied.

When you want to put more than one condition, you can write it like this:

**Example: CNS**
```ini
[State Sample]
type = PosAdd
triggerall = time = 0
trigger1 = stateType = S
trigger2 = stateType = C
trigger3 = stateType = L
x = 10
```
**Example: ZSS**
```go
if time = 0 {
    if stateType = S || stateType = C || stateType = L {
        posAdd{x: 10}
    }
}
```

You can write ifs inside another ifs to write more complex conditions.
An `if` statement tests it's condition and executes it's `{`-part or it's `else`-part accordingly. The else-part is optional.  
When you write nested ifs, you can also combine both `if` and `else` in the same line (the so called `else if` statement in programming languages).

**Example: CNS**
```ini
[State Sample]
type = PosAdd
triggerall = time = 0
trigger1 = stateType = S
y = -50

[State Sample]
type = VelAdd
triggerall = time = 0
trigger1 = stateType = A
y = 0.1

[State Sample]
type = PosSet
triggerall = time = 0
trigger1 = stateType != S
trigger1 = stateType != A
y = -20
```

**Example: ZSS**
```go
if time = 0 {
    if stateType = S {
        posAdd{y: -50}
    } else if stateType = A {
        velAdd{y: 0.1}
    } else {
        posSet{y: -20}
    }
}
```

## Switch statement

As an alternative to if/else, `switch` statement can be used to produce tidier, more understandable code. Cases are defined inside the statement, where multiple cases can trigger the same code block (separating them by using `;`), and a default block can be defined in case all the other cases fail to trigger.

**Example: If statement**
```go
if stateNo = 0 {
     playSnd{value: 2,1}
} else if stateNo = 10 || stateNo = 20 {
     playSnd{value: 2,2}
} else {
     playSnd{value: 2,0}
}
```

**Example: Switch statement**
```go
switch stateNo {
    case 0:
        playSnd{value: 2,1}
    case 10; 20:
        playSnd{value: 2,2}
    default:
        playSnd{value: 2,0}
}
```

## IgnoreHitPause and Persistent

Use `ignoreHitPause` for ignoring hit pauses.  
Use `persistent` for specifying the interval between execution frames.  
Code that should be affected by IgnoreHitPause and Persistent needs to be enclosed in {} (also affects nested blocks).  
They can be used individually, or as part of `if` statement (typed before `if`).
Unlike IgnoreHitPause from CNS, it's not a separate SCTRL parameter (except Explod, which allows setting this parameter arbitrarily).

**Example: CNS**
```ini
[State Sample]
type = PosAdd
trigger1 = 1
x = 10
ignorehitpause = 1
```
**Example: ZSS**
```go
ignoreHitPause {
    posAdd{x: 10}
}
```
**Example: CNS**
```ini
[State Sample]
type = PosAdd
trigger1 = 1
x = 10
persistent = 5
```
**Example: ZSS**
```go
persistent(5) {
    posAdd{x: 10}
}
```

Both IgnoreHitPause and Persistent can be specified at the same time. If you specify more than one, bring the `if` statement at the end.

Example: CNS
```ini
[State Sample]
type = PosAdd
trigger1 = Time = 0
x = 10
ignorehitpause = 1
persistent = 5
```
Example: ZSS
```go
ignoreHitPause persistent(5) if time = 0 {
    posAdd{x: 10}
}
```

## About Variables

In ZSS, simple variable operations such as VarSet/MapSet are obsolete.  
Instead, manipulate variables using `:=`.
It looks like an assignment expression that can be written with CNS trigger.

Example: CNS
```ini
[State Sample]
type = VarSet
trigger1 = 1
Var(59) = 1
```
Example: ZSS
```go
var(59) := 1;
```
Example: CNS
```ini
[State Sample]
type = MapAdd
trigger1 = 1
Map(collection) = 1
```
Example: ZSS
```go
map(collection) := map(collection) + 1;
```
Add `;` at the end of each assignment expression.

If you want to assign a variable to another character, specify the redirect to that character/helper as usual.

Example: CNS
```ini
[State Sample]
type = ParentVarSet
trigger1 = 1
Var(59) = 1
```
Example: ZSS
```go
parent,var(59) := 1;
```

## Comments
In ZSS, use `#` to comment lines of code instead of `;`.

## Local Variables

A variable that can only be used within a defined state and doesn't affect other states.
Up to 256 can be set. Used primarily for passing disposable variables in the state or for passing functions numerically.

### Local Variable declaration

**Format:**  
`let < variable name > = value;`  
Put a `;` at the end.

**Example:**

```js
let randomValue100 = Random%100;
```

If you want to change this value later, write it in exactly the same way.  
Remember that all the descriptions for putting values into local variables are in this format.

### Referencing local variables

Use: `$ Variable name`  
To refer to the variable declared in the above example.

```go
$randomValue100
```

## Loop statements

### For

`For` iterates code inside a strict range. Statement header accepts three expressions, where `exp1` and `exp2` are the range of the loop, in integers, and `exp3` is an optional incremental expression that can be positive or negative (a negative increment value will perform looping from a greater number to a lower one).

**Example 1:**
```go
for 0; 10 {
    map(collection) := map(collection) + 1;
}
```

Additionally, a control variable can be declared in the first expression of the header. Value from this local variable will persist after the loop has ended.

**Example 2:**
```go
for i = 20; 10; -1 {
    map(collection) := map(collection) + $i%4;
}
```

### While

`While` will iterate a state block indefinitely until the header expression returns false.

**Example:**
```go
while var(20) < 40 {
    var(20) := var(20) + 1;
}
```

### Break/Continue

Break/continue statements are useful to control the flow of the loop blocks. They're expected to be inside a loop block and must end with a `;`. Changing states inside loops will also break them.

**Example:**
```go
let i = 0;
while $i < 10 {
    if $i = 8 {
        break;
    }
    let i = $i + 1;
    if $i > 5 {
        continue;
    }
    map(collector) := map(collector) + 1;
}
```

For safety and performance reasons, loops will be automatically broken after 2500 iterations.


## Functions

A function is a group of processes that allows you to call and execute the work you have written previously in a separate location.

Instead of writing a process to be used many times, it is possible to abstract the process in the form of a function and only write the call statement in a Statedef itself.

In CNS, the more complicated the functions to be implemented, the more complicated the code becomes. However, in ZSS, this can be solved to some extent by using functions.

### Function definition

Use: ``[Function FunctionName()]``

**Example:** Function that plays voice during KO.

```c#
[Function PlayKOSound()]
playSnd{value: 11,0}
```

You can also write arguments and return values if you need them.

`[Function FunctionName(argumentName) return valueName]`

### Calling a function

Write in the format of: 
`call FunctionName();`  
Only the functions written above the calling state can be called, so pay attention to the order of calls.

Example: Calling the PlayKOSound() function written above:  
`call PlayKOSound ();`  
You can also include arguments by using:
`call FunctionName(argumentName);`  
See below for details.

### Function arguments 
A function can receive arguments and process it. This could be used to write processes that differ in input.  
Arguments are listed within the parentheses, and are separated by commas.
To call the argument inside the function, use `$`.

**Example:** Play a sound in the volume specified in the argument.
```csharp
[Function PlayKOSound(VoiceVolume)]
playSnd{
    value: 11,0;
    volumescale: $VoiceVolume;
}
```
* The received argument is treated as a local variable by the function.  
To call it we use:
`call PlayKOSound(200);` or `call PlayKOSound(50);`

Multiple arguments could be used.
**Example:** The function above but with the capacity of also setting the frequency.
```csharp
[Function PlayKOSound(VoiceVolume, Frequency)]
PlaySnd{
    value: 11,0;
    volumeScale: $VoiceVolume;
    freqMul: $Frequency;
}
```
And to call it we use:
`call PlayKOSound(200, 0.5);`

### Function return value 
Functions can return values to the caller. The value can be specified by writing it after the function definition. The returned value can be assigned to a variable.

A example of a Function with return argument:
```js
[Function IsHelperID() ret]

let ret = 0;

if isHelper(1) {
    let ret = 1;
} else if isHelper(2) {
    let ret = 2;
} else if isHelper(3) {
    let ret = 3;
} else if isHelper(4) {
    let ret = 4;
} else if isHelper(5) {
    let ret = 5;
}
```
In this case the return value was specified as `ret` in `[Function IsHelperID () ret]`  
As an example, you can retrieve the value like this:
```js
let helperIdValue = call IsHelperID();
```