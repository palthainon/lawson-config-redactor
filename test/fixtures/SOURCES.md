# Cisco lab sources

The test file `cisco-labs.ios` uses command structure from public Cisco lab examples. It does not contain a production configuration. Names, credentials, and server addresses are synthetic. `SEED-` values identify test secrets. The combined file tests the scanner. It is not a device configuration for deployment.

Retrieved on 2026-10-23:

- [BGP authentication lab, document 112188](https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/112188-configure-md5-bgp-00.html): interfaces, neighbors, passwords, and static routes.
- [OSPF authentication lab, document 13697](https://www.cisco.com/c/en/us/support/docs/ip/open-shortest-path-first-ospf/13697-25.html): interface keys, wildcard masks, and area authentication.
- [OSPF key chain example](https://www.cisco.com/c/en/us/td/docs/routers/ios-xe/ip-routing/b-ip-routing/m_iro-ospfv2-crypto-authen.html): key chains, key strings, and interface references.
- [TACACS authentication lab, document 200467](https://www.cisco.com/c/en/us/support/docs/security-vpn/terminal-access-controller-access-control-system-tacacs-/200467-Troubleshoot-TACACS-Authentication-Issue.html): authentication server commands.
- [NSA password type guidance](https://media.defense.gov/2022/Feb/17/2002940795/-1/-1/1/CSI_CISCO_PASSWORD_TYPES_BEST_PRACTICES_20220217.PDF): password types 0, 4, 5, 6, 7, 8, and 9. Type 7 values use reversible encoding. Type 5 values use MD5. Tests remove each value without decoding it.
- [IANA IPv4 registry](https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml) and [IANA IPv6 registry](https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xhtml): special address ranges. The mapper uses a conservative classification. It does not check ownership or reachability.

The additional credential matrix contains synthetic command cases. The matrix is not a claim of support for every Cisco release or every credential command.
