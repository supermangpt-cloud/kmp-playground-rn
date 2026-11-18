if(NOT TARGET fbjni::fbjni)
add_library(fbjni::fbjni SHARED IMPORTED)
set_target_properties(fbjni::fbjni PROPERTIES
    IMPORTED_LOCATION "/Users/liangyuanyuan-iri/.gradle/caches/8.13/transforms/36f583c0d3a690b0b45f46a03fd0f678/transformed/jetified-fbjni-0.7.0/prefab/modules/fbjni/libs/android.arm64-v8a/libfbjni.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/liangyuanyuan-iri/.gradle/caches/8.13/transforms/36f583c0d3a690b0b45f46a03fd0f678/transformed/jetified-fbjni-0.7.0/prefab/modules/fbjni/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

