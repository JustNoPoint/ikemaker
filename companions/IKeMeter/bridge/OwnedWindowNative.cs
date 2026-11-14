using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class OwnedWindowNative {
 public delegate bool EnumProc(IntPtr h,IntPtr d);
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int l,t,r,b;}
 [StructLayout(LayoutKind.Sequential)] public struct Gui {public int size;public uint flags;public IntPtr active,focus,capture,menu,moveSize,caret;public Rect rect;}
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p,IntPtr d);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint t,ref Gui g);
 public static IntPtr Find(int wanted){var found=new List<IntPtr>();EnumWindows((h,d)=>{uint p;GetWindowThreadProcessId(h,out p);Rect r;if(p==(uint)wanted&&IsWindowVisible(h)&&!IsIconic(h)&&GetWindowRect(h,out r)&&r.r-r.l>100&&r.b-r.t>100)found.Add(h);return true;},IntPtr.Zero);if(found.Count!=1) return IntPtr.Zero;return found[0];}
 public static object Read(IntPtr h,int wanted){uint p;uint tid=GetWindowThreadProcessId(h,out p);if(p!=(uint)wanted||tid==0)throw new Exception("Owned window changed");var g=new Gui();g.size=Marshal.SizeOf(typeof(Gui));if(!GetGUIThreadInfo(tid,ref g))throw new Exception("GUI state unavailable");return new {threadId=tid,moving=(g.flags&2)!=0,moveSizeHwnd=g.moveSize.ToInt64().ToString(),visible=IsWindowVisible(h),minimized=IsIconic(h)};}
 public static bool ModalNow(string handle,int pid,uint expectedThread,string started){try{using(var process=System.Diagnostics.Process.GetProcessById(pid)){var pin=process.Handle;if(process.HasExited||process.StartTime.ToUniversalTime().Ticks.ToString()!=started)return false;var h=new IntPtr(long.Parse(handle));uint owner;uint thread=GetWindowThreadProcessId(h,out owner);if(owner!=(uint)pid||thread!=expectedThread)return false;var g=new Gui();g.size=Marshal.SizeOf(typeof(Gui));return GetGUIThreadInfo(thread,ref g)&&(g.flags&2)!=0&&g.moveSize==h&&IsWindowVisible(h)&&!IsIconic(h);}}catch{return false;}}
}