# Vendor format sources

Access date: 2026-10-23. Fixtures contain synthetic values only.

- [Palo Alto set command reference](https://docs.paloaltonetworks.com/ngfw/pan-os-cli-quick-start/cli-changes/new-set-commands-12-1): user hashes and shared-key paths.
- [Palo Alto XML example](https://knowledgebase.paloaltonetworks.com/KCSArticleDetail?id=kA10g000000PPkCCAW&lang=en_US): user entries and password hashes.
- [Junos display set](https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/command/show-pipe-display-set.html): flat configuration format.
- [Junos user authentication](https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/statement/user-edit-system-login.html): password and public-key fields.
- [Junos privacy credentials](https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/statement/privacy-aes128-edit-snmp.html): privacy-key and privacy-password fields. Tests use synthetic values.
- [Junos shared keys](https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/statement/pre-shared-key-edit-security.html): ASCII and hexadecimal values.
- [Dell OS6 authentication](https://www.dell.com/support/kbdoc/en-za/000112951/how-to-configure-radius-or-tacacs-authentication-for-switch-management-on-n-series-switches?lang=en): server keys.
- [Dell OS9 configuration guide](https://downloads.dell.com/topicspdf/dell-emc-os-9_Administrator-Guide7_en-us.pdf): password and sha256-password forms.
- [Dell OS10 user guide](https://dl.dell.com/manuals/common/SmartFabricOS-10-5-0-UG-en-us.pdf): user credentials and SNMP values.

These references establish syntax for the test cases. They do not establish detection of every vendor secret. Unknown sensitive fields and unsupported structures require manual masking. XML mode masks attribute and text values conservatively. XML output is review text.
