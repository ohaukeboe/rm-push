{
  pkgs ? import <nixpkgs> { },
}:

pkgs.mkShell {
  packages = with pkgs; [
    bashInteractive
    bun
    firefox
    geckodriver
    web-ext
    biome
    typescript
  ];

  shellHook = ''
    export FIREFOX_BIN=${pkgs.firefox}/bin/firefox
    export GECKODRIVER=${pkgs.geckodriver}/bin/geckodriver
    # Selenium Manager must never download drivers or browsers; NixOS cannot run them.
    export SE_OFFLINE=true
  '';
}
