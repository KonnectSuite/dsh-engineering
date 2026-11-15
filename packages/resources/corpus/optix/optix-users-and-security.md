---
id: optix-users-and-security
title: The session carries the rights
domain: optix
level: practitioner
basis: [creating-projects/users/Users-and-groups.html, creating-projects/users/Roles.html, creating-projects/users/Groups.html, creating-projects/users/Add-a-user.html, creating-projects/users/Configure-visibility-at-runtime.html, creating-projects/authentication/Authentication.html, creating-projects/authentication/Configure-the-authentication-mode.html, creating-projects/audit-signing/Audit-signing.html, creating-projects/sessions/ui-session.html, creating-projects/sessions/Configure-idle-timeout-for-a-session.html, creating-projects/sessions/Configure-a-screen-saver-or-automatic-logout.html, Reference/FTOptix-UI/ObjectTypes/UISession.html, Reference/FTOptix-UI/ObjectTypes/PresentationEngine.html]
tags: [users, roles, sessions, login, audit, security]
applies_to: [optix]
rules: [OPTIX-SEC-01, OPTIX-SEC-02, OPTIX-SEC-03]
---
## Principle
A FactoryTalk Optix security policy is built from three model objects: users, groups and roles. A role is a set
of responsibilities (an Administrator, an Operator, a Guest), a group organises users, and the user record
carries the credentials, the locale, the measurement system and the group and role assignments. The interface
does not consult that model directly; it consults the session, which holds the logged-on user's groups and
roles and is the thing a dynamic link can reach at runtime. Gating a screen or a button is therefore a binding
to the session, not a conditional in a NetLogic and not a disabled property edited at design time.

Where the users come from changes what the project may do with them. The authentication mode is a project
property: model users maintained in the project, local machine users, domain users from Active Directory or
LDAP, or OAuth 2.0 identity providers. Domain logins create or map model users and map model groups to domain
groups, and the password policy applies to model users only. With the combined domain, local and model mode
the project can no longer change passwords or add users, so the mode is a deployment decision that is recorded
before the first login screen is built, not a setting to adjust later.

Sessions make the rest work. An interactive session creates the start window and holds the user, locale and
rights; a web presentation engine creates an independent session per browser connection, which does not attach
to the native session. Idle timeout belongs to the session object, and its event is where automatic logout or
a screen saver is wired. Audit signing is the last layer: it attaches an electronic-signature workflow -
confirm, sign, or double sign — to selected actions so a critical write records who authorised it.

## Rules
- **OPTIX-SEC-01** Users, groups and roles are declared in the model, each user has its locale, measurement
  system and at least one role, and the project's authentication mode is set explicitly at the project node
  (model, local, domain, the combined mode, or OAuth 2.0) with the consequence recorded — a project whose only
  gate is a hidden button, or whose mode was never chosen, is a defect.
- **OPTIX-SEC-02** Every restricted screen, panel, button and writable field is gated by a dynamic link from
  its `Visible` or `Enabled` property to the session's user, groups or roles
  (`Aliases > Session > Session`); a gate made by a NetLogic that sets `Visible`, or by two copies of a screen
  for two audiences, is a defect.
- **OPTIX-SEC-03** Logout paths are engineered: the presentation engine names a `LoginWindow`, the session has
  `IdleTimeoutEnabled` True with a stated `IdleTimeoutDuration`, the `IdleTimeoutEvent` is wired to the logout or
  screen-saver command, and every action that writes a critical value is covered by one of the audit-signing
  workflows; a writable critical value with no workflow and no timeout is a finding.

## Apply
Inventory the policy. `optix_read` `{action:"map", path:"Security"}` lists users, groups and roles,
`{action:"node"}` on a user returns `Locale`, `Languages`, `MeasurementSystem`, `Domain` and its assignments,
and `{action:"variable_members", path:"<user>", name:"..."}` reaches the nested collections the bridge exposes.
`{action:"node"}` on the project root returns the authentication mode and the supported locales, which the page
quotes back rather than assumes.

Author with the model tools. `optix_edit` `create_object` with `object_type` `User`, `Group` or `Role` under
the `Security` folder, `set_property` the user's `Locale`, `MeasurementSystem` and `Domain`, and
`create_alias`/`bind` to place the user in a group and the group in a role. The dashboard path
(Manage users and groups > Add user) and the Project view path (the project node's `New > User`) produce the
same objects, so the page never tells an agent to click the dashboard when the bridge can stage the object.

Gate through the session. On the object that must be restricted, `optix_edit` `bind` the `Visible` (or
`Enabled`) property to `{Session}/Session` and select the groups or roles node underneath it; in a widget the
same link is resolved through the panel's alias node, so it travels with the widget instead of naming one
project object. `optix_validate_expression` checks the composed expression before the batch is applied, and
`optix_design_check` reports a screen whose controls carry no event handler at all.

Engineer the exits. `optix_edit` `set_property` on the presentation engine: `LoginWindow` to the login screen
and `StartingUser` to the account the native panel boots as. Create or reuse a UI Session object, set
`IdleTimeoutDuration` and `IdleTimeoutEnabled` True, and `wire_event` its `IdleTimeoutEvent` to the logout or
screen-saver command; a screen saver is a shield container that absorbs the pointer (`HitTestVisible` True) and
sits above the content, dismissed by its own `MouseDown` command. Add audit signing to the critical write
paths and state which of the confirm, sign and double-sign workflows each one uses.

Prove it with a login, not with a screenshot of the editor. `optix_emulator` `{action:"restart"}`, log in as
each role and capture the screens with `optix_screenshot`; the acceptance evidence is the pair of captures -
the operator build and the administrator build — plus the timeout duration the reviewer can read in the model.
