# Security policy

## Supported versions

The latest published release of `@aryacode/dsh-engineering` receives fixes. There are no maintained
back-branches: an older version is not patched, it is superseded. Update before reporting, and say
which version you are on.

## Report privately

Do not open a public issue for a security problem. Report it through GitHub private vulnerability
reporting:

https://github.com/KonnectSuite/dsh-engineering/security/advisories/new

That form is visible to the maintainer only. If it is not available to you, open an issue that says
only that you have a security report and asks for a private channel; put no details in it, then send
the details once a channel is arranged.

Do not paste client data. Program exports, HMI projects, drawings, controller and network
addresses, credentials, licence keys and customer or site names are not needed to describe a
vulnerability. A reduced example, or a description of the shape of the input, is enough.

## In scope

- The code in this repository: tool implementations, tool schemas and descriptions, the files it
  reads and writes, the local preview faces, the packaged entries and the preset.
- The distribution boundary: what the tarball ships, which row a component mounts, and what a
  profile resolves after an update.
- The write and approval boundary: this bundle can change a controller and can change project and
  export files. It asks before it does, and those approvals are the safety boundary. A path that
  performs such a write without asking is a vulnerability, as is a way to make an approval cover a
  change the approval did not describe.

## Out of scope

- Rockwell software and the vendor applications: Studio 5000 Logix Designer, FactoryTalk View ME,
  FactoryTalk Optix, MotionWorks IEC, RSLogix 5, FactoryTalk Linx. Report those to their vendor. The
  bundle drives them; it does not own them.
- The AryaCode host, its installer and its profiles. Report those at
  https://github.com/KonnectSuite/AryaCode/issues.
- The correctness of a client's own program, export or drawing. A wrong rung or a tag that does not
  exist is a bug, not a vulnerability; report it through the issue forms.
- A problem that needs an already compromised machine, or a copy of the bundle that was modified by
  hand after installation.

## How reports are handled

This is a small project maintained alongside engineering work. Reports are read as they arrive and
handled on a best-effort basis: there is no service-level agreement, no fixed acknowledgement or fix
time, and no bug bounty. A report that names the tool, the shape of the input and the effect observed
is the fastest to act on.

A confirmed issue is fixed in a normal release, which ships in a batch rather than as an immediate
patch. The advisory is published after the fix is available, and credit is given if you ask for it.

## A note on what the plugin can do

The bundle is built to act on engineering systems: it writes controller tags over EtherNet/IP, it
writes project and export files, and it drives a Studio project through a bridge. Each of those
writes is gated by an approval in the host, and that approval is the boundary an operator relies on.
Read the approval before granting it; the bundle holds no credentials of its own and leaves vendor
logins with the vendor application.
