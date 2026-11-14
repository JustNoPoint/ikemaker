using System;
using System.ComponentModel;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;

namespace IKeMeter {
  public static class SecurePipeNative {
    private const uint PIPE_ACCESS_INBOUND = 0x00000001;
    private const uint FILE_FLAG_FIRST_PIPE_INSTANCE = 0x00080000;
    private const uint FILE_FLAG_OVERLAPPED = 0x40000000;
    private const uint PIPE_TYPE_BYTE = 0x00000000;
    private const uint PIPE_READMODE_BYTE = 0x00000000;
    private const uint PIPE_WAIT = 0x00000000;
    private const uint PIPE_REJECT_REMOTE_CLIENTS = 0x00000008;

    [StructLayout(LayoutKind.Sequential)]
    private struct SECURITY_ATTRIBUTES {
      public int nLength;
      public IntPtr lpSecurityDescriptor;
      [MarshalAs(UnmanagedType.Bool)] public bool bInheritHandle;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafePipeHandle CreateNamedPipeW(
      string lpName, uint dwOpenMode, uint dwPipeMode, uint nMaxInstances,
      uint nOutBufferSize, uint nInBufferSize, uint nDefaultTimeOut,
      ref SECURITY_ATTRIBUTES lpSecurityAttributes);

    public static NamedPipeServerStream CreateInbound(string name) {
      var identity = WindowsIdentity.GetCurrent();
      var security = new PipeSecurity();
      security.SetAccessRuleProtection(true, false);
      security.AddAccessRule(new PipeAccessRule(identity.User, PipeAccessRights.FullControl, AccessControlType.Allow));
      byte[] descriptor = security.GetSecurityDescriptorBinaryForm();
      var pinned = GCHandle.Alloc(descriptor, GCHandleType.Pinned);
      try {
        var attributes = new SECURITY_ATTRIBUTES {
          nLength = Marshal.SizeOf<SECURITY_ATTRIBUTES>(),
          lpSecurityDescriptor = pinned.AddrOfPinnedObject(),
          bInheritHandle = false,
        };
        uint mode = PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS;
        var handle = CreateNamedPipeW(@"\\.\pipe\" + name,
          PIPE_ACCESS_INBOUND | FILE_FLAG_FIRST_PIPE_INSTANCE | FILE_FLAG_OVERLAPPED,
          mode, 1, 4096, 4096, 0, ref attributes);
        if (handle.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
        return new NamedPipeServerStream(PipeDirection.In, true, false, handle);
      } finally {
        pinned.Free();
      }
    }
  }
}
