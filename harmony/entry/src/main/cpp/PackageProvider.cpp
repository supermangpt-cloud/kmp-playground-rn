/**
 * Copyright (c) 2024 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE-MIT file in the root directory of this source tree.
 */

#include "RNOH/PackageProvider.h"
#include "AppPackage.h"
#include "SVGPackage.h"
#include "VisionCameraPackage.h"
#include "WebViewPackage.h"

using namespace rnoh;

std::vector<std::shared_ptr<Package>> PackageProvider::getPackages(
    Package::Context ctx) {
  // The RNOH core package is added by the framework itself; the native
  // third-party packages in this app are linked by hand. AppPackage lives in
  // this directory: it registers the app's ArkTS-only turbo modules
  // (`VisionCameraModule`) with the C++ turbo module factory.
  return {std::make_shared<AppPackage>(ctx),
          std::make_shared<WebViewPackage>(ctx),
          std::make_shared<SVGPackage>(ctx),
          std::make_shared<VisionCameraPackage>(ctx)};
}
