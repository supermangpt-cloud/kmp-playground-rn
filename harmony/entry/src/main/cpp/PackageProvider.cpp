/**
 * Copyright (c) 2024 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE-MIT file in the root directory of this source tree.
 */

#include "RNOH/PackageProvider.h"
#include "WebViewPackage.h"

using namespace rnoh;

std::vector<std::shared_ptr<Package>> PackageProvider::getPackages(
    Package::Context ctx) {
  // The RNOH core package is added by the framework itself; the only native
  // third-party package in this app is the HarmonyOS WebView adaptation.
  return {std::make_shared<WebViewPackage>(ctx)};
}
