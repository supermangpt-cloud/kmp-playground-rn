if(NOT TARGET hermes-engine::hermesvm)
add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
    IMPORTED_LOCATION "/Users/liangyuanyuan-iri/.gradle/caches/8.13/transforms/d2832d1008aab15d2e5b9a84e153812c/transformed/jetified-hermes-android-250829098.0.17-debug/prefab/modules/hermesvm/libs/android.arm64-v8a/libhermesvm.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/liangyuanyuan-iri/.gradle/caches/8.13/transforms/d2832d1008aab15d2e5b9a84e153812c/transformed/jetified-hermes-android-250829098.0.17-debug/prefab/modules/hermesvm/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

